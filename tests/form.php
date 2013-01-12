<?php

	if (isset($_POST['identifier']) && $_POST['identifier'] == 'form-1') {
		if (empty($_POST['text'])) {
			echo "Please insert your name:<br />";
		} else {
			echo "Success!";
			goto form_2;
		}
	}

?>
<form method="post">
	<input type="hidden" name="identifier" value="form-1" />
	<input type="text" name="text" />
	<input type="submit" value="Form 1" />
</form>

<?php

	form_2:

	if (isset($_POST['identifier']) && $_POST['identifier'] == 'form-2') {
		if (empty($_POST['text'])) {
			echo "Please insert your name:<br />";
		} else {
			echo "Success!<br />";
			goto redirect;
		}
	}

?>
<form method="post" enctype="multipart/form-data">
	<input type="hidden" name="identifier" value="form-2" />
	<input type="text" name="text" />
	<input type="file" name="file" />
	<input type="submit" value="Form 2" />
</form>

<?php

	redirect:

?>

<a href="ajax.html" class="kTip-redirect">redirect</a>