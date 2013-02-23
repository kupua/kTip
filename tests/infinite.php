<?php

header("Cache-Control: no-cache, must-revalidate"); // IE fix

$unique_id = rand(0, 10000);

?>

<p>Infinite <a href="infinite.php" id="infinite-<?=$unique_id?>">tooltips</a>!</p>

<script>
	var $infinite = $('#infinite-<?=$unique_id?>');

	$infinite.kTip({
		display: $infinite.parents(':kTip').kTip().settings.display,
		overlay: false,
		css: {
			padding: '25px 25px 15px'
		}
	});
</script>