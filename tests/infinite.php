<?php

header("Cache-Control: no-cache, must-revalidate"); // IE fix

$unique_id = rand(0, 10000);

?>

<p>Infinite <a href="infinite.php" id="infinite-<?=$unique_id?>">tooltips</a>!</p>

<script>
	$('#infinite-<?=$unique_id?>').kTip({
		css: {
			padding: '25px 25px 15px'
		}
	});
</script>