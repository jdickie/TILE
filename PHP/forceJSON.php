<?php
//force download of JSON data - fed through POST request

// Code mostly taken from Doug Reside's sendData.php
// Commits JSON data to a file to be stored on client's HDD

include_once('secureInput.php');

checkLink($_SERVER['PHP_SELF']);

if(isset($_POST['uploadData'])){
	$domain=$_SERVER['HTTP_HOST'];
	$path=checkLink($_SERVER['PHP_SELF']);
	$path = substr($path,0,strrpos($path,"/"));
	$path=preg_replace('/lib\/SaveProgress/',"",$path);
	$cwd = "http://".$domain.$path."/loadJSON.php"; //path for loading this data back into TILE
	
	$JSON=htmlspecialchars($_POST['uploadData']);
	//$JSON=addslashes($JSON);
	//format the JSON text elements
	//$dJSON=json_decode($JSON); //decode string
	
	$d=date("j\_n\_Y");
	$filename="tile_".$d.".html";
	$doc="<HTML><HEAD><SCRIPT language=\"JavaScript\">function send(){document.aData.submit();}</SCRIPT></HEAD><BODY onload=\"send()\">
	<form name=\"aData\" method=\"POST\" action=\"".$cwd."\">
	<input type=\"hidden\" name=\"jsonData\" value=\"".$JSON."\"/></form></BODY></HTML>";
	//force-download the doc-string to the user to save
	header('Content-Type: text/plain');
	header('Content-Disposition: attachment; filename='.$filename);
	header('Content-Transfer-Encoding: binary');
	echo $doc;
}

?>