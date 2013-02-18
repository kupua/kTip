<?php

	if (isset($_POST['identifier']) && $_POST['identifier'] == 'form-1') {
		if (empty($_POST['text'])) {
			echo "<p class='alert'>Please insert your name:</p>";
		} else {
			echo "<p class='info'><strong>Hi ", htmlspecialchars($_POST['text'], ENT_QUOTES), "!</strong></p>";
			goto form_2;
		}
	}

?>
<form method="post">
	<p>
		<input type="hidden" name="identifier" value="form-1" />
		<input type="text" name="text" />
		<input type="submit" value="Form 1" />
	</p>
</form>

<?php

	form_2:

	if (isset($_POST['identifier']) && $_POST['identifier'] == 'form-2') {
		if (empty($_POST['text'])) {
			echo "<p class='alert'>Please insert your name:</p>";
		} else {
			echo "<p class='info'><strong>Hi ", htmlspecialchars($_POST['text'], ENT_QUOTES), "!</strong></p>";
			goto redirect;
		}
	}

?>
<form method="post">
	<p>
		<input type="hidden" name="identifier" value="form-2" />
		<input type="text" name="text" />
		<input type="submit" value="Form 2" />
	</p>
</form>

<?php

	redirect:

?>

<p><a href="ajax.html" class="kTip-redirect">Redirect</a></p>