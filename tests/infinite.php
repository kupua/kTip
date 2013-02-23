<?php

header("Cache-Control: no-cache, must-revalidate"); // IE fix

$unique_id = rand(0, 10000);

?>

<p>Infinite <a href="infinite.php" id="infinite-<?=$unique_id?>">tooltips</a>!</p>

<script>
	var $infinite = $('#infinite-<?=$unique_id?>'),
	    kTipInstance = $infinite.parents(':kTip').kTip(),
	    display = kTipInstance.settings.display,
	    padding = <?=(int)@$_GET['padding']?> || 200;

	if (display == 'modal') {
		$infinite.text("modals");
		$infinite.kTip({
			display: display,
			overlay: false,
			ajax: {
				data: {
					padding: padding -5
				}
			},
			css: {
				padding: padding + 'px ' + padding + 'px ' + (padding - 10) + 'px'
			}
		});
	} else {
		$infinite.kTip({
			css: {
				padding: '25px 25px 15px'
			}
		});
	}
</script>