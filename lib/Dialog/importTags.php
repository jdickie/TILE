<?php
//For importing tags into the TILE interface
//checks for $FILE input data and echos the contents of the given filename


if (is_uploaded_file($_FILES['fileTags']['tmp_name']))
 { 
 
 $fileData = file_get_contents($_FILES['fileTags']['tmp_name']);
 	echo $fileData;
 }






?>