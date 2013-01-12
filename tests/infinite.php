<?php

$unique_id = rand(0, 10000);

?>

Infinite <a href="infinite.php" id="infinite-<?=$unique_id?>">tooltips</a>!

<script>
	$('#infinite-<?=$unique_id?>').kTip({
		css: {
			padding: 15
		}
	});
</script>