/**
 * kTip 0.0.14
 * Based on mgExternal 1.0.30
 *
 * Copyright 2012 Ricard Osorio Mañanas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * TODO:
 *   - Test callbacks
 *   - Fit to mobile
 *   - Hide if trigger is hidden
 *   - Aware of z-index
 *   - Detect ajaxForm
 *   - Tooltip left/right to top/bottom on mobile
 *   - Cancel ajax requests on close (including file uploads), but don't call
 *     onFailedRequest? Or do?
 *   - Have separate overlays and be aware of z-indexes when using children
 *     (also ability to have 0 opacity modals over parent modals)
 *   - When two overlays are opened at the same time, the first one to close
 *     restores the body CSS, leaving 2 scrollbars
 */

(function($, window, undefined){

	//---[ Browser utils ]----------------------------------------------------//

	var browserVendorPrefixes = ' Webkit Moz O ms Khtml'.split(' ');

	// Real value is calculated on document ready
	var browserScrollbarWidth;

	// Based on https://hacks.mozilla.org/2011/09/detecting-and-generating-css-animations-in-javascript/
	var browserSupportsCSSAnimations = function(){
		var elem = document.createElement('div');

		for (var i = 0; i < browserVendorPrefixes.length; i++) {
			if (browserVendorPrefixes[i] + 'AnimationName' in elem.style) {
				return true;
			}
		}
		return false;
	}();

	// Each browser listens to its own event
	var animationEnd = 'animationend webkitAnimationEnd oanimationend MSAnimationEnd';

	//---[ jQuery plugin ]----------------------------------------------------//

	$.fn.kTip = function(defaultContent, options) {
		var instance,
		    count = 0;
		this.each(function(){
			if ($(this).data('kTip')) {
				instance = $(this).data('kTip');
			} else {
				count++;
				$(this).data('kTip', kTip(this, defaultContent, options));
			}
		});
		// jQuery objects with only 1 element return either the instance or a
		// jQuery chain. Multiple elements always return a jQuery chain.
		// Eg:
		//   $('#elem').kTip(); First call, returns jQuery
		//   $('#elem').kTip(); Second call, returns kTip instance
		//   $('.elements').kTip(); First call, returns jQuery
		//   $('.elements').kTip(); Second call, returns jQuery
		return (!instance || count > 1) ? this : instance;
	};

	$.expr[':'].kTip = function(elem) {
		return !!$(elem).data('kTip');
	};

	//---[ kTip constructor ]-------------------------------------------------//

	$.kTip = window.kTip = function(trigger, defaultContent, options) {

		// Force instance: ktip(...) -> new kTip(...)
		if (!(this instanceof kTip)) {
			return new kTip(trigger, defaultContent, options);
		}

		// trigger is optional when used only once. Eg: kTip("Hi!");
		if (!trigger || !trigger.nodeType) {
			options = defaultContent;
			defaultContent = trigger;
			trigger = null;
		}

		// No defaultContent is required, as long as settings.ajax.url is set
		// or an href attribute is provided
		if (typeof defaultContent == 'object') {
			options = defaultContent;
			defaultContent = null;
		}

		// data-ktip-options HTML attributes are a valid alternate method
		// of passing options
		options = $.extend(true, {}, this.defaults, options, $(trigger).data('ktipOptions'));

		// Default settings
		this.settings = {

			// Core
			display: 'tooltip', // tooltip, modal
			auto: !trigger, // Auto-open, default false if a trigger exists
			renew: true, // Should each call fetch new data
			autoFocus: true, // Auto-focus first input element
			outsideClose: true, // Hide container when an outside click occurs
			escClose: true, // Hide container when the ESC key is pressed
			destroyOnClose: !trigger, // Destroy all generated elements and remove bindings

			// Appearance
			css: {}, // Custom CSS
			cssAnimations: true, // Use CSS animations when possible
			extraClass: (options && options.display) ? 'kT-'+options.display : 'kT-tooltip',
			activeClass: 'active',
			loadingClass: 'loading',
			disabledClass: 'disabled',
			showDelay: (options && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Show delay in ms
			hideDelay: (options && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Hide delay in ms
			showAnimation: 'kTip-fadeInDown',
			showSpeed: 300,
			hideAnimation: 'kTip-fadeOutDown',
			hideSpeed: 300,
			overlay: (options && options.display == 'modal') ? true : false,
			overlayColor: '#fff',
			overlayOpacity: 0.7, // Opacity from 0 to 1
			overlayShowSpeed: 300,
			overlayHideSpeed: 300,
			submitIdentifier: 'input[type="submit"]',
			focusPriority: [
				'[autofocus]:visible:enabled:first',
				':input:not(:radio):visible:enabled:first'
			],
			zIndexContainer: 999,
			zIndexTooltipTrigger: 998,
			zIndexOverlay: 997,
			breatheSeparation: (options && options.display == 'modal') ? 30 : 0,

			// Ajax built-in functionality
			ajax: {
				url: undefined, // URL to fetch data from (if no defaultContent is provided or a form is sent)
				data: {}, // Additional arguments to be sent
				handleForms: true // Depends on the existence of the jQuery Form Plugin (https://github.com/malsup/form)
			},

			// Modal settings
			modal: {
				animateSpeed: 500,
				onDisableScroll: function(){},
				onRestoreScroll: function(){}
			},

			// Tooltip settings
			tooltip: {
				bind: 'click', // click, hover or focus
				position: 'top center', // top/bottom left/center/right, or left/right top/middle/bottom
				positionSource: $(trigger),
				distance: 0,
				arrowSize: 8, // Arrow size in pixels
				arrowDistance: 15,
				arrowFrontColor: undefined,
				fit: true
			},

			// Callbacks
			onCreateElements: function(){},
			onBeforeShow:     function(){}, // returning false prevents opening
			onShow:           function(){},
			onBeforeClose:    function(){}, // returning false prevents closing
			onClose:          function(){},
			onDestroy:        function(){},
			onContentReady:   function(){},
			onStartLoading:   function(){},
			onStopLoading:    function(){},
			onFailedRequest: function(jqXHR, textStatus, errorThrown) {
				alert("Please implement onFailedRequest to manage failed ajax requests.");
			},
			onJsonData: function(data) {
				alert("Please implement onJsonData to manage ajax JSON responses.");
			}
		};

		// Apply options
		$.extend(true, this.settings, options);

		// Help detect children
		this.settings.tooltip.positionSource.data('kTip', this);

		// Internal jQuery elements
		this.$trigger = $(trigger);
		this.$container = null;
		this.$content = null;
		this.$overlay = null;
		this.$tooltipArrow = null;

		// Private vars
		this._defaultContent = defaultContent;
		this._defaultAjaxUrl = this.settings.ajax.url;
		this._lastSubmitName = null;
		this._show = false;
		this._triggerZIndexBackup = null;
		this._preventNextMouseup = false;
		this._moveTimeout = null;
		// this._currentAjaxRequest = null;
		this._lastMousedownOutside;

		// Set trigger bindings
		if (this.$trigger) {
			var self = this;

			switch (this.settings.display) {

				case 'modal':
					this.$trigger.on('click', function(e){
						self.open(self.settings.showDelay);
						e.preventDefault();
						//e.stopPropagation();
					});
					break;

				case 'tooltip':
					switch (this.settings.tooltip.bind) {
						case 'click':
							this.$trigger.on('click', function(e){
								self.isVisible() ? self.close() : self.open(self.settings.showDelay);
								e.preventDefault();
								//e.stopPropagation();
							});
							break;
						case 'hover':
							this.$trigger.on({
								mouseenter: function(){self.open(self.settings.showDelay)},
								mouseleave: function(){self.close(self.settings.hideDelay)},
								mousedown: function(e){e.stopPropagation()},
								mouseup: function(e){e.stopPropagation()}
							});
							break;
						case 'focus':
							this.$trigger.on({
								focus: function(){self.open(self.settings.showDelay)},
								blur: function(){self.close(self.settings.hideDelay)},
								mousedown: function(e){e.stopPropagation()},
								mouseup: function(e){e.stopPropagation()}
							});
							break;
					}
					break;
			}
		}

		// Auto-open if set
		if (this.settings.auto) {
			this.open();
		}
	};

	//---[ kTip prototype ]---------------------------------------------------//

	kTip.prototype = {

		defaults: {},

		isVisible: function() {
			return !!this.$container && this.$container.is(':visible');
		},

		areAllChildrenClosed: function() {

			// Find children that have kTip instances. If they are open, let
			// them decide about their own children (don't do recursive search).

			var allChildrenClosed = true;

			this.$content.find(':kTip').each(function(){
				if ($(this).kTip().isVisible()) {
					allChildrenClosed = false;
				}
			});

			return allChildrenClosed;
		},

		modalContainerSwitch: function(enable) {
			$('body').css({
				marginRight: enable ? browserScrollbarWidth : '',
				overflow: enable ? 'hidden' : ''
			});

			if (enable) {
				this.$container.parent().show();
				this.settings.modal.onDisableScroll.call(this);
			} else {
				this.$container.parent().hide();
				this.settings.modal.onRestoreScroll.call(this);
			}
		},

		open: function(delay) {
			var self = this;
			this._show = true;
			// Using a delay value of `0` would still
			// create a noticeable visual effect
			delay ? setTimeout(function(){self._open()}, delay)
			      : this._open();
		},

		_open: function() {

			if (!this._show || this.isVisible()) {
				return;
			}

			var self = this;

			// New content
			if (this.settings.renew || !this.$container) {
				this.settings.ajax.url = this._defaultAjaxUrl;
				this._lastSubmitName = null;

				var url = this.settings.ajax.url || this.$trigger.attr('href');

				if (this._defaultContent) {
					this.setContent(this._defaultContent);
				} else if (url) {
					if (url.match(/\.(jpg|gif|png|bmp|jpeg)(.*)?$/i)) {
						this.setContent('<img src="'+url+'" style="display:block;" />');
					} else {
						this.loadAjaxContent(url);
					}
				} else {
					throw "kTip: no defaultContent or settings.ajax.url provided.";
				}
			}
			// Show existing content
			else if (!this.isVisible()) {
				this.showContainer();
			}
		},

		close: function(delay) {
			var self = this;
			this._show = false;
			delay ? setTimeout(function(){self._close()}, delay)
			      : this._close();
		},

		_close: function() {

			if (this._show || !this.isVisible() || this.settings.onBeforeClose.call(this) === false) {
				return;
			}

			var self = this;

			// this.abortCurrentAjaxRequest();
			this.$trigger
				.removeClass(this.settings.loadingClass)
				.removeClass(this.settings.activeClass);

			this.settings.onStopLoading.call(this);

			// Fade container out
			var onContainerFadeOut = function() {
				// Hide after a CSS animation
				self.$container.hide();

				if (self.settings.display == 'modal') {
					self.modalContainerSwitch(false);
				}

				// If set to be destroyed, remove the content and bindings,
				// and call onDestroy
				if (self.settings.destroyOnClose) {
					self.destroy();
				}
			};

			if (this.settings.cssAnimations && browserSupportsCSSAnimations) {
				this.$container
					.off(animationEnd)
					.on(animationEnd, onContainerFadeOut)
					.css({
						animationDuration: this.settings.hideSpeed + 'ms',
						animationFillMode: 'both',
						animationName: this.settings.hideAnimation
					});
			} else {
				this.$container.fadeOut(300, onContainerFadeOut);
			}

			if (this.settings.overlay) {
				if (this.settings.display == 'modal') {
					this.$overlay.fadeOut(this.settings.overlayHideSpeed, function(){
						self.settings.onClose.call(self);
					});
				} else if (this.settings.display == 'tooltip') {
					this.$overlay.fadeOut(this.settings.overlayHideSpeed, function(){
						self.$trigger.css({
							position: self._triggerZIndexBackup.position,
							zIndex: self._triggerZIndexBackup.zIndex
						});
						self.settings.onClose.call(self);
					});
				}
			}

			// Close opened children
			this.$content.find(':kTip').each(function(){
				$(this).kTip().close();
			});
		},

		setContent: function(html, modalAnimation) {

			if (!this.$container) {
				this.createElements();
			}

			if (this.settings.display == 'modal') {
				modalAnimation = modalAnimation || {type: 'resize'};
				modalAnimation.$preContent = this.$content.clone(false);
				modalAnimation.preHeight = this.$content.height();
				modalAnimation.preWidth = this.$content.width();
			}

			var $dummyContent = this.$content.clone();

			$dummyContent.appendTo(this.$container);

			this.$content
				.html(html)
				.css({
					// left: 0,
					// top: 0,
					// position: 'absolute',
					visibility: 'hidden'
				})
				.appendTo('body');

			this.bindSpecialActions();
			this.settings.onContentReady.call(this);

			this.$content.css({
				// left: '',
				// top: '',
				// position: '',
				visibility: ''
			});

			this.$content.appendTo(this.$container);

			$dummyContent.remove();

			// If onContentReady or any other code has decided to close the
			// container, don't continue moving/showing it
			if (this._show) {
				if (this.isVisible() && this.$container.css('opacity') == 1) {
					this.setFocus();
					return this.moveContainer(modalAnimation, true);
				} else {
					this.showContainer();
				}
			}
		},

		showContainer: function() {

			if (this.settings.onBeforeShow.call(this) === false) {
				return;
			}

			var self = this;

			this.$trigger.addClass(this.settings.activeClass);

			if (this.settings.display == 'tooltip' && this.settings.overlay) {
				this._triggerZIndexBackup = {
					position: this.$trigger.css('position') == 'static' ? '' : this.$trigger.css('position'),
					zIndex: this.$trigger.css('z-index') == 0 ? '' : this.$trigger.css('z-index')
				};
				this.$trigger.css({
					position: this._triggerZIndexBackup.position ? null : 'relative',
					zIndex: this.settings.zIndexTooltipTrigger
				});
			}

			if (this.settings.overlay) {
				if (this.settings.display == 'modal') {
					this.modalContainerSwitch(true);
					this.$overlay.fadeIn(this.settings.overlayShowSpeed);
				} else {
					this.$overlay.fadeIn(this.settings.overlayShowSpeed);
				}
			}

			// Fade container in
			var onContainerFadeIn = function() {
				self.setFocus();
				self.settings.onShow.call(self);
			};

			// Set correct position before showing
			self.$container.css('visibility', 'hidden').show();
			self.moveContainer({type: 'instant'});
			self.$container.hide().css('visibility', '');

			if (this.settings.cssAnimations && browserSupportsCSSAnimations) {
				this.$container
					.off(animationEnd)
					.on(animationEnd, onContainerFadeIn)
					.show()
					.css({
						animationDuration: this.settings.showSpeed + 'ms',
						animationFillMode: 'both',
						animationName: this.settings.showAnimation
					});
			} else {
				this.$container.fadeIn(300, onContainerFadeIn);
			}
		},

		destroy: function() {
			if (this.settings.display == 'modal' && this.settings.overlay) {
				this.$container.parent().remove();
			} else {
				this.$container.remove()
			}
			this.settings.onDestroy.call(this);
			this.$trigger.removeData('kTip');
		},

		bindSpecialActions: function() {

			var self = this;

			// File uploads don't work on IE. MUST FIX
			if (this.settings.ajax.handleForms && $.fn.ajaxSubmit) {
				this.$content.find('form').on('submit', function(e){
					var $form = $(this);
					e.preventDefault();
					// if ($form.attr('enctype') == 'multipart/form-data' || $form.find('input[type="file"]').length) {
					// 	alert("File uploads are discouraged in the current version of kTip. Please provide support through an external plugin.");
					// 	return;
					// }
					self._lastSubmitName = $form.find(self.settings.submitIdentifier).val();
					$form.ajaxSubmit($.extend(true, {}, self.settings.ajax, $form.data('kTip-ajax'), {
						url: $form.attr('action') || self.settings.ajax.url || self.$trigger.attr('href'),
						success: function(data) {
							self.disableLoadingState();
							self.settings.onStopLoading.call(self);

							if (typeof data == 'object') {
								self.settings.onJsonData.call(self, data);
							} else {
								self.setContent(data);
							}
						},
						error: function(jqXHR, textStatus, errorThrown){
							self.settings.onFailedRequest.call(self, jqXHR, textStatus, errorThrown);
						}
					}));
					self.setLoadingState(); // After submit, as we are disabling all input fields
				});
			}

			// this.$content.find('form').on('submit kTip_submit', function(e){
			// 	e.preventDefault();
			// 	var $elem = $(this);
			// 	if (e.type == 'kTip_submit') {
			// 		self.loadAjaxContent($elem, {type: 'move'}, 100);
			// 	} else {
			// 		// We wrap the call so other events are called first (we give
			// 		// priority to form validation, custom submits, etc.)
			// 		setTimeout(function(){
			// 			if (!e.isPropagationStopped())
			// 				$elem.trigger('kTip_submit');
			// 		}, 100);
			// 	}
			// });

			this.$content.find('[class*="kTip-redirect"]').on('click', function(e){
				var $elem = $(this);

				e.preventDefault();

				// $elem.addClass(self.settings.loadingClass); // Why repeat? Already used in loadAjaxContent

				var modalAnimation = {};

				if (self.settings.display == 'modal') {
					if ($elem.is('[class*="redirect-fade"]')) {
						modalAnimation.type = 'fade';
					} else if ($elem.is('[class*="redirect-move"]')) {
						modalAnimation.type = 'move';
					} else if ($elem.is('[class*="redirect-instant"]')) {
						modalAnimation.type = 'instant';
					} else {
						modalAnimation.type = 'resize';
					}
				}

				self.redirect($elem.attr('href'), modalAnimation);
			});

			this.$content.find('.kTip-close').on('click', function(e){
				self.close();
				e.preventDefault();
			});
		},

		// abortCurrentAjaxRequest: function() {
		// 	if (this._currentAjaxRequest) {
		// 		this._currentAjaxRequest.abort();
		// 		this._currentAjaxRequest = null;
		// 	}
		// },

		redirect: function(url, modalAnimation) {
			this.settings.ajax.url = url;
			this.loadAjaxContent(url, modalAnimation);
		},

		loadAjaxContent: function(url, modalAnimation) {

			// this.abortCurrentAjaxRequest();

			var self = this;

			this.setLoadingState();
			this.settings.onStartLoading.call(this);

			$.ajax($.extend(true, {}, self.settings.ajax, {
				type: 'GET',
				url: url,
				success: function(data){
					// self._currentAjaxRequest = null;
					self.disableLoadingState();
					self.settings.onStopLoading.call(self);

					if (typeof data == 'object') {
						self.settings.onJsonData.call(self, data);
					} else {
						self.setContent(data, modalAnimation);
					}
				},
				error: function(jqXHR, textStatus, errorThrown){
					self.settings.onFailedRequest.call(self, jqXHR, textStatus, errorThrown);
					// self._currentAjaxRequest = null;

					// if (textStatus !== 'abort') {
					// 	self.$trigger.removeClass(self.settings.loadingClass);
					// 	self.settings.onStopLoading.call(self);
					// 	self.setContent('<div class="notice alert">S\'ha produït un error</div>', modalAnimation);
					// }
				}
			}));
		},

		setLoadingState: function() {
			if (this.$trigger) {
				this.$trigger.addClass(this.settings.loadingClass);
			}

			if (this.$content) {
				this.$content.find(':input').prop('disabled', true);
				this.$content.find(':input, .kTip-loading-disabled').addClass(this.settings.disabledClass);
				this.$content.find('.kTip-loading').show();
			}
		},

		disableLoadingState: function() {
			if (this.$trigger) {
				this.$trigger.removeClass(this.settings.loadingClass);
			}

			if (this.$content) {
				this.$content.find(':input').prop('disabled', false);
				this.$content.find(':input, .kTip-loading-disabled').removeClass(this.settings.disabledClass);
				this.$content.find('.kTip-loading').hide();
			}
		},

		setFocus: function() {

			if (!this.settings.autoFocus) {
				return;
			}

			var form = this.$content.find(this.settings.submitIdentifier+'[value="'+this._lastSubmitName+'"]').parents('form:visible');

			if (form.length == 0) {
				form = this.$content.find('form:first:visible');
			}

			if (form.length == 0) {
				form = this.$content;
			}

			for (var i = 0, firstInput = form.find(this.settings.focusPriority[i]);
			     firstInput.length == 0 && i <= this.settings.focusPriority.length;
			     firstInput = form.find(this.settings.focusPriority[++i])){}

			setTimeout(function(){
				firstInput.trigger('focus');
			}, 10);
		},

		createElements: function() {

			var self = this;

			if (!this.$container) {
				this.$container = $('<div/>')
					.data('kTip', this) // Help detect children
					.addClass('kTip-container')
					.addClass(this.settings.extraClass)
					.css({
						position: 'absolute',
						zIndex: this.settings.zIndexContainer
					})
					.hide()
					.appendTo(this.settings.display == 'modal' && this.settings.overlay
						? $('<div/>')
							.data('kTip', this) // Help detect children
							.css({
								height: '100%',
								left: 0,
								overflowY: 'scroll',
								position: 'fixed',
								top: 0,
								width: '100%',
								zIndex: this.settings.zIndexContainer
							})
							.hide()
							.appendTo('body')
						: 'body')
					.on('mouseup', function(e){
						// Required if outsideClose is set to true
						self._preventNextMouseup = true;
					});

				this.$content = $('<div/>')
					.addClass('kTip-content')
					.css(this.settings.css)
					.appendTo(this.$container);

				if (this.settings.tooltip.bind == 'hover') {
					this.$container.on('mouseenter', function(){self.open(self.settings.showDelay)});
					this.$container.on('mouseleave', function(){self.close(self.settings.hideDelay)});
				}

				// Resize re-position
				$(window).on('resize', function(){self.moveContainer()});

				if (this.settings.display == 'tooltip') {
					$(window).on('scroll', function(){self.moveContainer()});
				}

				// Hide on outside click
				if (this.settings.outsideClose) {

					// `mousedown` event fires everytime, even when the clicking
					// a scrollbar. We don't want to close on scrollbar click,
					// so we should use `mouseup` (`click` gives problems
					// sometimes). Problem is, when some selects a text, the
					// mousedown starts inside the container, but sometimes ends
					// outside. We also don't want to close in that circumstance.
					// So here we are, tracking where the clicking starts...

					$('body').on('mousedown', function(e){
						if (self.areAllChildrenClosed() && !self.$container.is(e.target) && !self.$container.find(e.target).length) {
							self._lastMousedownOutside = true;
						} else {
							self._lastMousedownOutside = false;
						}
					});

					// ...and here closing when it started outside. Tada!
					// Also: using body instead of document as clicking on the
					// sidebar would trigger the event.
					$('body').on('mouseup', function(e){
						if (self._lastMousedownOutside) {
							if (self._preventNextMousedown) {
								self._preventNextMousedown = false;
							} else if (e.which == 1 && self.isVisible()) {
								self.close();
							}
						}
					});
				}

				// Hide on ESC press
				if (this.settings.escClose) {
					$(document).on('keyup', function(e){
						if (e.keyCode == 27 && self.isVisible() && self.areAllChildrenClosed()) {
							self.close();
						}
					});
				}

				self.settings.onCreateElements.call(self);
			}

			if (this.settings.overlay && !this.$overlay) {
				this.$overlay = $('<div/>')
					.data('kTip', this) // Help detect children
					.attr('class', 'kTip-overlay')
					.css({
						background: this.settings.overlayColor,
						height: '100%', // 100% doesn't work properly on touchscreens
						left: 0,
						opacity: this.settings.overlayOpacity,
						position: 'fixed',
						top: 0,
						width: '100%', // 100% doesn't work properly on touchscreens
						zIndex: this.settings.zIndexOverlay
					})
					.hide()
					.appendTo('body');
			}

			if (!this.$tooltipArrow && this.settings.display == 'tooltip' && this.settings.tooltip.arrowSize) {
				this.$tooltipArrow = $('<div/>')
					.addClass('kTip-arrow')
					.css({
						position: 'absolute'
					})
					.appendTo(this.$container)
					.append($('<div/>')
						.addClass('kTip-arrow-shadow')
						.css({
							borderStyle: 'solid',
							borderWidth: this.settings.tooltip.arrowSize
						})
					)
					.append($('<div/>')
						.addClass('kTip-arrow-front')
						.css({
							borderColor: this.settings.tooltip.arrowFrontColor || this.$content.css('background-color'),
							borderStyle: 'solid',
							borderWidth: this.settings.tooltip.arrowSize,
							position: 'absolute'
						}
					));
			}
		},

		moveContainer: function(modalAnimation, force) {

			if (!this.isVisible()) {
				return;
			}

			this.$content.stop();

			//---[ Fix narrow blocks past body width ]------------------------//

			modalAnimation = modalAnimation || {type: 'resize'};

			if (!modalAnimation.preHeight || !modalAnimation.preWidth) {
				modalAnimation.preHeight = this.$content.height();
				modalAnimation.preWidth = this.$content.width();
			}

			if (!this.settings.css.height || !this.settings.css.width) {
				if (force || !this._moveTimeout) {
					var self = this;

					// Create a temp container once every 200ms, to avoid browser
					// slowness when scrolling
					this._moveTimeout = setTimeout(function(){
						self._moveTimeout = null;
					}, 200);

					var $tempContainer = this.$container.clone();

					$tempContainer
						.css({
							left: 0,
							top: 0,
							visibility: 'hidden'
						})
						.find('.kTip-content')
							.css({
								height: this.settings.css.height || '',
								width: this.settings.css.width || ''
							})
							.end()
						.show()
						.appendTo('body');

					this.$content.css({
						//height: $tempContainer.find('.kTip-content').height()
						width: $tempContainer.find('.kTip-content').width()
					});

					$tempContainer.remove();
				}
			}

			modalAnimation.postHeight = this.$content.height();
			modalAnimation.postWidth = this.$content.width();

			//---[ Call depending on display ]--------------------------------//

			switch (this.settings.display) {
				case 'modal':
					this.moveModal(modalAnimation);
					break;
				case 'tooltip':
					this.moveTooltip();
					break;
			}
		},

		moveModal: function(modalAnimation) {

			var self = this,
			    top = 0,
			    left = 0,
			    breatheSeparation = this.settings.breatheSeparation;

			this.$container.css('padding', breatheSeparation+'px 0 '+(breatheSeparation*2)+'px');

			var containerHeight = this.$container.outerHeight(true),
			    containerWidth = this.$container.outerWidth(true),
			    wrapperHeight = $(window).height(),
			    wrapperWidth = $(window).width(),
			    scrollTop = this.settings.overlay ? 0 : $(document).scrollTop();

			if (this.settings.overlay) {
				containerWidth += browserScrollbarWidth;
			}

			if (containerHeight < wrapperHeight) {
				top = scrollTop + ((wrapperHeight - containerHeight) / 2);
			}

			if (top < scrollTop) {
				top = scrollTop;
			}

			left = (wrapperWidth - containerWidth) / 2;
			if (left < 0) {
				left = 0;
			}

			switch (modalAnimation.type) {

				case 'fade':
					this.$content.hide();
					this.$container
						.append(modalAnimation.$preContent)
						.fadeOut(this.settings.modal.animateSpeed, function(){
							modalAnimation.$preContent.remove();
							self.$content.show();
							self.$container.css({
								top: top,
								left: left
							}).fadeIn(self.settings.modal.animateSpeed, function(){
								self.setFocus();
							});
						});
					break;

				case 'move':
					this.$container.stop().animate({
						top: top,
						left: left,
						opacity: 1
					}, this.settings.modal.animateSpeed);
					break;

				case 'instant':
					this.$container.stop().css({
						top: top,
						left: left,
						opacity: 1
					});
					break;

				case 'resize':
				default:
					this.$content.css({
						height: modalAnimation.preHeight,
						width: modalAnimation.preWidth
					}).animate({
						height: modalAnimation.postHeight,
						width: modalAnimation.postWidth
					}, this.settings.modal.animateSpeed, function(){
						self.$content.css('height', self.settings.css.height || '');
					});
					this.$container.stop().animate({
						top: top,
						left: left,
						opacity: 1
					}, this.settings.modal.animateSpeed);
					break;
			}
		},

		moveTooltip: function() {

			//---[ Useful vars ]----------------------------------------------//

			var pos = {top: 0, left: 0},
			    breatheSeparation = this.settings.breatheSeparation
			                      + this.settings.tooltip.arrowSize,
			    windowHeight = $(window).height(),
			    windowWidth = $(window).width(),
			    containerHeight = this.$container.outerHeight(true),
			    containerWidth = this.$container.outerWidth(true),
			    $source = this.settings.tooltip.positionSource,
			    sourceOffset = $source.offset(),
			    sourceHeight = $source.outerHeight(),
			    sourceWidth = $source.outerWidth(),
			    distance = this.settings.tooltip.distance,
			    arrowSize = this.settings.tooltip.arrowSize,
			    arrowDistance = this.settings.tooltip.arrowDistance,
			    scrollTop = $(document).scrollTop(),
			    scrollLeft = $(document).scrollLeft(),
			    position = this.settings.tooltip.position.split(' ')[0],
			    modifier = this.settings.tooltip.position.split(' ')[1];

			//---[ Fit in window 1 ]------------------------------------------//

			if (this.settings.tooltip.fit) {

				if (position == 'bottom' && windowHeight < (sourceOffset.top - scrollTop + sourceHeight + containerHeight + breatheSeparation)) {
					position = 'top';
				}

				if (position == 'top' && (sourceOffset.top - scrollTop - breatheSeparation) < containerHeight) {
					position = 'bottom';
				}

				if (position == 'right' && windowWidth < (sourceOffset.left - scrollLeft + sourceWidth + containerWidth + breatheSeparation)) {
					position = 'left';
				}

				if (position == 'left' && (sourceOffset.left - scrollLeft - breatheSeparation) < containerWidth) {
					position = 'right';
				}
			}

			//---[ Position ]-------------------------------------------------//

			switch (position) {
				case 'top':
					pos.top = sourceOffset.top - containerHeight - distance - arrowSize;
					break;
				case 'bottom':
					pos.top = sourceOffset.top + sourceHeight + distance + arrowSize;
					break;
				case 'left':
					pos.left = sourceOffset.left - containerWidth - distance - arrowSize;
					break;
				case 'right':
					pos.left = sourceOffset.left + sourceWidth + distance + arrowSize;
					break;
			}

			//---[ Modifier ]-------------------------------------------------//

			switch (modifier) {
				case 'top':
					pos.top = sourceOffset.top;
					break;
				case 'middle':
					pos.top = sourceOffset.top - (containerHeight/2) + (sourceHeight/2);
					break;
				case 'bottom':
					pos.top = sourceOffset.top - containerHeight + sourceHeight;
					break;
				case 'left':
					pos.left = sourceOffset.left;
					break;
				case 'center':
					pos.left = sourceOffset.left - (containerWidth/2) + (sourceWidth/2);
					break;
				case 'right':
					pos.left = sourceOffset.left - containerWidth + sourceWidth;
					break;
			}

			//---[ Fit in window 2 ]------------------------------------------//

			if (this.settings.tooltip.fit) {

				var move, posFit;

				if (position == 'left' || position == 'right') {
					posFit = {
						pos: 'top',
						source: sourceHeight,
						sourceOffset: sourceOffset.top,
						container: containerHeight,
						window: windowHeight,
						scroll: scrollTop
					};
				} else {
					posFit = {
						pos: 'left',
						source: sourceWidth,
						sourceOffset: sourceOffset.left,
						container: containerWidth,
						window: windowWidth,
						scroll: scrollLeft
					};
				}

				while ((pos[posFit.pos] - posFit.scroll + posFit.container + breatheSeparation) > posFit.window) {
					move = false;
					if (posFit.container >= posFit.source) {
						if ((pos[posFit.pos] + posFit.container) > (posFit.sourceOffset + posFit.source)) {
							move = true;
						}
					} else if (pos[posFit.pos] > posFit.sourceOffset) {
						move = true;
					}

					if (move) {
						pos[posFit.pos]--;
					} else {
						break;
					}
				}

				while ((pos[posFit.pos] - posFit.scroll) < breatheSeparation) {
					move = false;
					if (posFit.container >= posFit.source) {
						if (pos[posFit.pos] < posFit.sourceOffset) {
							move = true;
						}
					} else if ((pos[posFit.pos] + posFit.container) < (posFit.sourceOffset + posFit.source)) {
						move = true;
					}

					if (move) {
						pos[posFit.pos]++;
					} else {
						break;
					}
				}

				if (arrowSize && posFit.source < (arrowSize + arrowDistance*2)) {
					var arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos],
					    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;

					if (!(arrowSeparationTop < arrowDistance && arrowSeparationBottom < arrowDistance)) {
						if (arrowSeparationTop < arrowDistance) {
							pos[posFit.pos] = posFit.sourceOffset + (posFit.source / 2) - arrowSize - arrowDistance;
						}
						if (arrowSeparationBottom < arrowDistance) {
							pos[posFit.pos] = posFit.sourceOffset - posFit.container + (posFit.source / 2) + arrowSize + arrowDistance;
							arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
						}
						arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
					    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;
						if (arrowSeparationTop < arrowDistance || arrowSeparationBottom < arrowDistance) {
							pos[posFit.pos] = posFit.sourceOffset - ((posFit.container - (arrowSize * 2)) / 2);
						}
					}
				}
			}

			//---[ Arrow ]----------------------------------------------------//

			if (arrowSize) {
				if (!this.$tooltipArrow) {
					this.createElements();
				}

				this.$tooltipArrow.show();

				if (position == 'top' || position == 'bottom') {
					this.$tooltipArrow.css({
						bottom: position == 'top' ? -arrowSize : '',
						height: arrowSize,
						left: (containerWidth < sourceWidth)
							? (containerWidth / 2) - arrowSize
							: (sourceOffset.left - pos.left) + (sourceWidth / 2) - arrowSize,
						top: position == 'top' ? '' : -arrowSize,
						width: arrowSize*2
					}).find('div').css({
						borderLeftColor: 'transparent',
						borderRightColor: 'transparent',
						borderBottomWidth: position == 'top' ? 0 : arrowSize,
						borderTopWidth: position == 'bottom' ? 0 : arrowSize
					}).filter('.kTip-arrow-front').css({
						left: 0,
						top: (position == 'top' ? '-' : '')+this.$content.css('borderBottomWidth')
					}).end().filter('.kTip-arrow-shadow')
						.css('border-'+position+'-color', this.$content.css('border-'+(position == 'top' ? 'bottom' : 'top')+'-color'));
				} else {
					this.$tooltipArrow.css({
						bottom: '',
						height: arrowSize*2,
						left: position == 'left' ? '' : -arrowSize,
						right: position == 'right' ? '' : -arrowSize,
						top: (containerHeight < sourceHeight)
							? (containerHeight / 2) - arrowSize
							: (sourceOffset.top - pos.top) + (sourceHeight / 2) - arrowSize,
						width: arrowSize
					}).find('div').css({
						borderBottomColor: 'transparent',
						borderTopColor: 'transparent',
						borderLeftWidth: position == 'right' ? 0 : arrowSize,
						borderRightWidth: position == 'left' ? 0 : arrowSize
					}).filter('.kTip-arrow-front').css({
						left: (position == 'left' ? '-' : '')+this.$content.css('borderBottomWidth'),
						top: 0
					}).end().filter('.kTip-arrow-shadow')
						.css('border-'+position+'-color', this.$content.css('border-'+(position == 'left' ? 'right' : 'left')+'-color'));
				}
			} else if (this.$tooltipArrow) {
				this.$tooltipArrow.hide();
			}

			//---[ Experimental fixed position ]------------------------------//

			if (position == 'bottom') {
				var $aux = $source,
				    isFixed = false;

				while (!$aux.is('body')) {
					if ($aux.css('position') == 'fixed') {
						isFixed = true;
						break;
					}
					$aux = $aux.parent();
				}

				if (isFixed) {
					pos.position = 'fixed';
					//pos.top = $source.position().top + sourceHeight + 2;
					pos.top = pos.top - scrollTop;
				} else {
					pos.position = 'absolute';
				}
			}

			//---[ Apply changes ]--------------------------------------------//

			this.$container.css({
				top: Math.round(pos.top),
				left: Math.round(pos.left),
				position: position
			});
		}
	};

	//---[ Browser scrollbar width ]------------------------------------------//

	$(function(){
		var $testDiv = $('<div/>')
			.css({
				height: 100,
				overflowY: 'scroll',
				width: 100
			})
			.append($('<div/>').css('height', 200))
			.appendTo('body');

		browserScrollbarWidth = $testDiv.innerWidth() - $testDiv.children().innerWidth();

		$testDiv.remove();
	});

})(jQuery, window);