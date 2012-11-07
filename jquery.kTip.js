/**
 * kTip 0.0.10
 * Based on mgExternal 1.0.30
 *
 * Copyright 2012 Ricard Osorio Mañanas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * TODO:
 *   - Infinite linked tooltips
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

//---[ jQuery plugin ]--------------------------------------------------------//

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

//---[ kTip constructor ]-----------------------------------------------------//

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
			extraClass: (options && options.display) ? 'kT-'+options.display : 'kT-tooltip',
			activeClass: 'active',
			loadingClass: 'loading',
			disabledClass: 'disabled',
			showDelay: (options && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Show delay in ms
			hideDelay: (options && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Hide delay in ms
			showSpeed: 300,
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
				url: null, // URL to fetch data from (if no defaultContent is provided or a form is sent)
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
				arrowFrontColor: null,
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
			onJsonData: function(data){
				alert("Please implement onJsonData to manage ajax JSON responses.");
			}
		};

		// Apply options
		$.extend(true, this.settings, options);

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
		this._registeredChildren = [];
		this._lastMousedownOutside;

		// Set trigger bindings
		if (this.$trigger) {
			var self = this;

			switch (this.settings.display) {

				case 'modal':
					this.$trigger.bind('click', function(e){
						self.open(self.settings.showDelay);
						e.preventDefault();
						//e.stopPropagation();
					});
					break;

				case 'tooltip':
					switch (this.settings.tooltip.bind) {
						case 'click':
							this.$trigger.bind('click', function(e){
								self.isVisible() ? self.close() : self.open(self.settings.showDelay);
								e.preventDefault();
								//e.stopPropagation();
							});
							break;
						case 'hover':
							this.$trigger.bind({
								mouseenter: function(){self.open(self.settings.showDelay)},
								mouseleave: function(){self.close(self.settings.hideDelay)},
								mousedown: function(e){e.stopPropagation()},
								mouseup: function(e){e.stopPropagation()}
							});
							break;
						case 'focus':
							this.$trigger.bind({
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

//---[ kTip prototype ]-------------------------------------------------------//

	kTip.prototype = {

		defaults: {},

		_browserScrollbarWidth: 17, // Default value, will be updated when DOM is ready

		registerChild: function(childInstance) {
			this._registeredChildren.push(childInstance);
		},

		isVisible: function() {
			return !!this.$container && this.$container.is(':visible');
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
			this.$trigger.removeClass(this.settings.loadingClass).removeClass(this.settings.activeClass);
			this.settings.onStopLoading.call(this);

			// Fade container out
			this.$container.fadeOut(this.settings.hideSpeed, function(){

				// If set to be destroyed, remove the content and bindings,
				// and call onDestroy
				if (self.settings.destroyOnClose) {
					self.destroy();
				}

				if (self.settings.display == 'modal' && self.settings.overlay) {
					self.$container.parent().hide();
					$('body').css({
						marginRight: '',
						overflow: ''
					});
					self.settings.modal.onRestoreScroll.call(self);
					self.$overlay.fadeOut(self.settings.overlayHideSpeed, function(){
						self.settings.onClose.call(self);
					});
				} else {
					self.settings.onClose.call(self);
				}
			});

			if (this.settings.display == 'tooltip' && this.settings.overlay) {
				this.$overlay.fadeOut(this.settings.overlayHideSpeed, function(){
					self.$trigger.css({
						position: self._triggerZIndexBackup.position,
						zIndex: self._triggerZIndexBackup.zIndex
					});
				});
			}
		},

		setContent: function(html, modalContentChangeAnimation) {

			var self = this;

			if (!this.$container) {
				this.createElements();
			}

			if (this.settings.display == 'modal') {
				modalContentChangeAnimation = modalContentChangeAnimation || {type: 'resize'};
				modalContentChangeAnimation.$preContent = this.$content.clone(false);
				modalContentChangeAnimation.preHeight = this.$content.height();
				modalContentChangeAnimation.preWidth = this.$content.width();
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
				// We remove the margin for the first DIV element due to aesthetical
				// reasons. If you wish to maintain those proportions, you should set
				// the equivalent padding in settings.css
				// .children()
				// 	.css({
				// 		marginLeft: 0,
				// 		marginRight: 0
				// 	})
				// 	.first()
				// 		.css('margin-top', '0')
				// 		.end()
				// 	.last()
				// 		.css('margin-bottom', '0')
				// 		.end()
				// 	.end()
				.appendTo('body');

			this.bindSpecialActions();
			this.settings.onContentReady.call(this);

			var proceed = function() {
				self.$content.css({
					// left: '',
					// top: '',
					// position: '',
					visibility: ''
				});

				self.$content.appendTo(self.$container);

				$dummyContent.remove();

				if (self.isVisible() && self.$container.css('opacity') == 1) {
					self.setFocus();
					return self.moveContainer(modalContentChangeAnimation, true);
				} else {
					self.showContainer();
				}
			}

			proceed();

			/*var $images = this.$content.find('img');

			if ($images.length) {
				var loadedImages = 0;
				$images.on('load', function(){
					if (++loadedImages >= $images.length)
						proceed();
				});
			} else {
				proceed();
			}*/
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

			// Fade container in, and call onShow. If it's a modal, fade
			// overlay in before
			var fadeInContainer = function(){
				if (self.settings.display == 'modal' && self.settings.overlay) {
					self.$container.parent().show();
				}

				// Set correct position before showing
				self.$container.css('visibility', 'hidden').show();
				self.moveContainer({type: 'instant'});
				self.$container.hide().css('visibility', '');

				self.$container.fadeIn(self.settings.showSpeed, function(){
					self.setFocus();
					self.settings.onShow.call(self);
				});
			};

			if (this.settings.overlay) {
				if (this.settings.display == 'modal') {
					$('body').css({
						marginRight: this._browserScrollbarWidth,
						overflow: 'hidden'
					});
					this.settings.modal.onDisableScroll.call(this);
					this.$overlay.fadeIn(this.settings.overlayShowSpeed, fadeInContainer);
				} else {
					this.$overlay.fadeIn(this.settings.overlayShowSpeed);
					fadeInContainer();
				}
			} else {
				fadeInContainer();
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
				this.$content.find('form').bind('submit', function(e){
					var $form = $(this);
					e.preventDefault();
					// if ($form.attr('enctype') == 'multipart/form-data' || $form.find('input[type="file"]').length) {
					// 	alert("File uploads are discouraged in the current version of kTip. Please provide support through an external plugin.");
					// 	return;
					// }
					self._lastSubmitName = $form.find(self.settings.submitIdentifier).val();
					$form.ajaxSubmit($.extend(true, {}, {
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
					}, self.settings.ajax, $form.data('kTip-ajax')));
					self.setLoadingState(); // After submit as we are disabling all input fields
				});
			}

			// this.$content.find('form').bind('submit kTip_submit', function(e){
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

			this.$content.find('[class*="kTip-redirect"]').bind('click', function(e){
				var $elem = $(this);

				e.preventDefault();

				// $elem.addClass(self.settings.loadingClass); // Why repeat? Already used in loadAjaxContent

				var modalContentChangeAnimation = {};

				if (self.settings.display == 'modal') {
					if ($elem.is('[class*="redirect-fade"]')) {
						modalContentChangeAnimation.type = 'fade';
					} else if ($elem.is('[class*="redirect-move"]')) {
						modalContentChangeAnimation.type = 'move';
					} else if ($elem.is('[class*="redirect-instant"]')) {
						modalContentChangeAnimation.type = 'instant';
					} else {
						modalContentChangeAnimation.type = 'resize';
					}
				}

				self.redirect($elem.attr('href'), modalContentChangeAnimation);
			});
			this.$content.find('.kTip-close').bind('click', function(e){
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

		redirect: function(url, modalContentChangeAnimation) {
			this.settings.ajax.url = url;
			this.loadAjaxContent(url, modalContentChangeAnimation);
		},

		loadAjaxContent: function(url, modalContentChangeAnimation) {

			// this.abortCurrentAjaxRequest();

			var self = this;
				// ajaxData = $.extend({}, self.settings.ajaxData);

			this.setLoadingState();
			this.settings.onStartLoading.call(this);

			// if (submit) {
			// 	this._lastSubmitName = submit.find(this.settings.submitIdentifier).val();
			// 	submit.find(':input').each(function(){
			// 		if ($(this).is(':checkbox')) {
			// 			ajaxData[$(this).attr('name')] = $(this).prop('checked') ? 1 : 0;
			// 		} else if ($(this).is(':radio')) {
			// 			if ($(this).prop('checked'))
			// 				ajaxData[$(this).attr('name')] = $(this).val();
			// 		} else {
			// 			ajaxData[$(this).attr('name')] = $(this).val();
			// 		}
			// 	});
			// }

			// We'll use an iframe as an ajax workaround if we're dealing with file uploads
			// if (submit && submit.attr('enctype') == 'multipart/form-data') {

			// 	// Create a random ID for the new iframe
			// 	var iframeName = 'kTip-iframe'+Math.floor(Math.random()*99999);

			// 	// Create the iframe
			// 	$('<iframe name="'+iframeName+'" id="'+iframeName+'" src="" style="display:none;"></iframe>')
			// 		.appendTo('body')
			// 		.bind('load', function(){
			// 			self.$trigger.removeClass(self.settings.loadingClass);
			// 			self.settings.onStopLoading.call(self);

			// 			var response = $(this).contents().find('body').html();
			// 			// Is it a JSON object?
			// 			try {
			// 				var data = eval('('+response+')');
			// 				if (typeof data == 'object') {
			// 					self.settings.onJsonData.call(self, data);
			// 					return;
			// 				}
			// 			} catch (err) {}
			// 			// ... or just plain HTML?
			// 			self.setContent(response, modalContentChangeAnimation);
			// 		});

			// 	// Leave a visible copy of the form for usability reasons (we'll move the original)
			// 	submit.clone().insertAfter(submit);

			// 	// Add ajaxData vars as hidden inputs
			// 	$.each(this.settings.ajaxData, function(name, value){
			// 		submit.append('<input type="hidden" name="'+name+'" value="'+value+'" />');
			// 	});

			// 	// Move form inside the iframe (Chrome had issues otherwise)
			// 	submit.appendTo($('#'+iframeName))
			// 		  .attr('action', this.settings.ajaxUrl || this.$trigger.attr('href'))
			// 		  .attr('target', iframeName)
			// 		  .append('<input type="hidden" name="is_iframe" value="true" />')
			// 		  .unbind('submit')
			// 		  .trigger('submit');
			// } else {
				$.ajax({
					type: 'GET',
					url: url,
					data: this.settings.ajax.data,
					success: function(data){
						// self._currentAjaxRequest = null;
						self.disableLoadingState();
						self.settings.onStopLoading.call(self);

						if (typeof data == 'object') {
							self.settings.onJsonData.call(self, data);
						} else {
							self.setContent(data, modalContentChangeAnimation);
						}
					},
					error: function(jqXHR, textStatus, errorThrown){
						self.settings.onFailedRequest.call(self, jqXHR, textStatus, errorThrown);
						// self._currentAjaxRequest = null;

						// if (textStatus !== 'abort') {
						// 	self.$trigger.removeClass(self.settings.loadingClass);
						// 	self.settings.onStopLoading.call(self);
						// 	self.setContent('<div class="notice alert">S\'ha produït un error</div>', modalContentChangeAnimation);
						// }
					}
				});
			// }

			// if (this.$content)
			// 	this.setLoadingState();
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
					.data('kTip', this)
					.addClass('kTip-container')
					.addClass(this.settings.extraClass)
					.css({
						position: 'absolute',
						zIndex: this.settings.zIndexContainer
					})
					.hide()
					.appendTo(this.settings.display == 'modal' && this.settings.overlay
						? $('<div/>')
							.data('kTip', this) // Used to detect children
							.css({
								height: '100%',
								left: 0,
								overflowY: 'scroll',
								position: 'fixed',
								top: 0,
								width: '100%',
								zIndex: this.settings.zIndexContainer
							})
							.appendTo('body')
						: 'body')
					.bind('mouseup', function(e){
						// Required if outsideClose is set to true
						self._preventNextMouseup = true;
					});

				this.$content = $('<div/>')
					.addClass('kTip-content')
					.css(this.settings.css)
					.appendTo(this.$container);

				if (this.settings.tooltip.bind == 'hover') {
					this.$container.bind('mouseenter', function(){self.open(self.settings.showDelay)});
					this.$container.bind('mouseleave', function(){self.close(self.settings.hideDelay)});
				}

				// Resize re-position
				$(window).bind('resize', function(){self.moveContainer()});

				if (this.settings.display == 'tooltip') {
					$(window).bind('scroll', function(){self.moveContainer()});
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
						// Detect if the target is inside a kTip container. If
						// it is, check if the instance has been registered as
						// a child.
						var targetIsChild = false,
						    parentInstance = $(e.target).data('kTip') // Click has been done directly to the container
						                  || $(e.target).parents('.kTip-container').data('kTip');

						$.each(self._registeredChildren, function(key, instance){
							if (instance === parentInstance) {
								targetIsChild = true;
							}
						});

						if (!targetIsChild && !self.$container.is(e.target) && !self.$container.find(e.target).length) {
							self._lastMousedownOutside = true;
						} else {
							self._lastMousedownOutside = false;
						}
					});

					// ...and here closing when it started outside. Tada!
					// Also: using body instead of document as clicking on the
					// sidebar would trigger the event.
					$('body').bind('mouseup', function(e){
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
					$(document).bind('keyup', function(e){
						var childOpen = false;
						$.each(self._registeredChildren, function(key, instance){
							if (instance.isVisible()) {
								childOpen = true;
							}
						});
						if (!childOpen && e.keyCode == 27)
							self.close();
					});
				}

				self.settings.onCreateElements.call(self);
			}

			if (this.settings.overlay && !this.$overlay) {
				this.$overlay = $('<div/>')
					.data('kTip', this) // Used to detect children
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

		moveContainer: function(modalContentChangeAnimation, force) {

			if (!this.isVisible()) {
				return;
			}

			this.$content.stop();

			//---[ Fix narrow blocks past body width ]------------------------//

				modalContentChangeAnimation = modalContentChangeAnimation || {type: 'resize'};

				if (!modalContentChangeAnimation.preHeight || !modalContentChangeAnimation.preWidth) {
					modalContentChangeAnimation.preHeight = this.$content.height();
					modalContentChangeAnimation.preWidth = this.$content.width();
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

				modalContentChangeAnimation.postHeight = this.$content.height();
				modalContentChangeAnimation.postWidth = this.$content.width();

			//---[ Call depending on display ]--------------------------------//

			switch (this.settings.display) {
				case 'modal':
					this.moveModal(modalContentChangeAnimation);
					break;
				case 'tooltip':
					this.moveTooltip();
					break;
			}
		},

		moveModal: function(modalContentChangeAnimation) {

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
				containerWidth += this._browserScrollbarWidth;
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

			switch (modalContentChangeAnimation.type) {

				case 'fade':
					this.$content.hide();
					this.$container
						.append(modalContentChangeAnimation.$preContent)
						.fadeOut(this.settings.modal.animateSpeed, function(){
							modalContentChangeAnimation.$preContent.remove();
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
						height: modalContentChangeAnimation.preHeight,
						width: modalContentChangeAnimation.preWidth
					}).animate({
						height: modalContentChangeAnimation.postHeight,
						width: modalContentChangeAnimation.postWidth
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

			//---[ Useful vars ]--------------------------------------------------//

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

			//---[ Fit in window 1 ]----------------------------------------------//

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

			//---[ Position ]-----------------------------------------------------//

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

			//---[ Modifier ]-----------------------------------------------------//

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

			//---[ Fit in window 2 ]----------------------------------------------//

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

			//---[ Arrow ]--------------------------------------------------------//

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

			this.$container.css(pos);
		}
	};

//---[ Browser scrollbar width ]----------------------------------------------//

	$(function(){
		var $testDiv = $('<div/>')
			.css({height: 100, overflow: 'hidden', position: 'absolute', width: 100})
			.append($('<div/>').css('height', '100%'))
			.appendTo('body');

		window.kTip.prototype._browserScrollbarWidth = $testDiv.find('> div').width()
		                                                   - $testDiv.css('overflow-y', 'scroll').find('> div').width();
		$testDiv.remove();
	});

})(jQuery, window);