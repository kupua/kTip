<?php

	var_dump($_FILES);

?>
<form id="file-upload-form" method="post" enctype="multipart/form-data">
	<input name="text" type="text" value="<?=@$_POST['text']?>" /><br />
	<input name="file" type="file" /><br />
	<input type="submit" />
</form>
<div id="progress"></div>

<script>
(function(){
	// var instance = $('#file-upload-form').parents('.kTip-container').kTip();
	// $('#progress').click(function(){instance._currentAjaxRequest.abort()});
	$('#file-upload-form').data('kTip-ajax', {
		beforeSend: function(){
			$('#progress').html("0%");
			// instance.moveContainer();
		},
		uploadProgress: function(event, position, total, percentComplete){
			$('#progress').html(percentComplete + "%");
			// instance.moveContainer();
		}
	});
})();
</script>