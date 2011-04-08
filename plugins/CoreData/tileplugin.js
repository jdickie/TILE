// Creates a link between Coredata.php and fellow libraries for importing and exporting into TILE

// Data needs to be saved in containers

var CoreData={
	name:"CoreData",
	start:function(mode){
		var self=this;
		
		// add formats to the known formats
		// Call the findFileFormats script
		// store to later add to save and load dialogs
		var str=$.ajax({
			url:'ImportExportScripts/findFileFormats.php',
			type:'GET',
			async:false
		}).responseText;
		
		// send to tile engine
		TILE.engine.addImportExportFormats(str);
		
		if(TILE.content){
			self.xmlDoc=$.parseXML(TILE.content);
			self.$xml=$( self.xmlDoc );
		}
		// handler for data creation (dataAdded)
		// $("body").live("dataAdded",{obj:self},self.dataAddedHandle);
		// catches the additional 'content' variable from Coredata.php
		// $("body").bind('contentCreated',function(e,content){
		
		
				
		// });
		// handlers for dataDeleted and dataUpdated
		
	},
	dataAddedHandle:function(e,obj){
		var self=e.data.obj;
		if(!self.xmlDoc) return;
		
		shape=obj.obj;
		switch(obj.type.toLowerCase()){
			case 'shapes':
				var zones=self.xmlDoc.getElementsByTagName('surface')[0].childNodes;
				if(__v) console.log('ZONES: '+zones);
				var found=false;
				for(var c=0;c<zones.length;c++){
					if(zones[c].getAttribute('xml:id')==shape.id){
						found=true;
					}
				}
				// $(surface).find('zone').each(function(i,o){
				// 					if($(o).attr('xml:id')==obj.id){
				// 						found=true;
				// 					}
				// 				});
				if(!found){
					var el=self.xmlDoc.createElement('zone');
					el.setAttributeNS('http://www.tei-c.org/ns/1.0','xml:id',shape.id);
					el.setAttribute('rendition','');
					el.setAttribute('ulx',shape.posInfo.x);
					el.setAttribute('uly',shape.posInfo.y);
					el.setAttribute('lrx',(shape.posInfo.x+shape.posInfo.width));
					el.setAttribute('lry',(shape.posInfo.y+shape.posInfo.height));
					self.xmlDoc.getElementsByTagName('surface')[0].appendChild(el);

					// $(self.xmlDoc).find('surface').append('<zone xml:id="'+shape.id+'" rendition="" ulx="'+shape.posInfo.x+'" uly="'+shape.posInfo.y+'" lrx="'+(shape.posInfo.x+shape.posInfo.width)+'" lry="'+(shape.posInfo.y+shape.posInfo.height)+'"></zone>');
					
					// creates: '<zone xml:id="'+shape.id+'" rendition="" ulx="'+shape.posInfo.x+'" uly="'+shape.posInfo.y+'" lrx="'+(shape.posInfo.x+shape.posInfo.width)+'" lry="'+(shape.posInfo.y+shape.posInfo.height)+'"></zone>'
					if(__v){
						console.log("Resulting XML");
						var n=new XMLSerializer();
						console.log(n.serializeToString(self.xmlDoc));
					}
				}
				break;
			case 'selections':
				break;
			case 'labels':
				break;
		}
		
	},
	
	dataLinkedHandle:function(e,args){
		var self=e.data.obj;
		if(!self.xmlDoc) return;
		var o1=null;
		var o2=null;
		for(var x in args){
			// see if its a shape
			if(args[x].type){
				var obj=args[x];
				var shape=obj.obj;
				switch(obj.type.toLowerCase()){
					case 'shapes':
						var zones=self.xmlDoc.getElementsByTagName('surface')[0].childNodes;
						var found=false;
						for(var x=0;x<zones.length;x++){
							if(zones[x].getAttributeNS('http://www.tei-c.org/ns/1.0','xml:id')==shape.id){
								if(o1){ 
									o2=$(zones[x]);
								} else {
									o1=$(zones[x]);
								}
							}
						}
						// $(surface).find('zone').each(function(i,o){
						// 							if($(o).attr('xml:id')==obj.id){
						// 								if(o1){ 
						// 									o2=$(o);
						// 								} else {
						// 									o1=$(o);
						// 								}
						// 							}
						// 						});
						// if(!found){
						// 							
						// 							$surface.append('<zone xml:id="'+shape.id+'" rendition="" ulx="'+shape.posInfo.x+'" uly="'+shape.posInfo.y+'" lrx="'+(shape.posInfo.x+shape.posInfo.width)+'" lry="'+(shape.posInfo.y+shape.posInfo.height)+'"></zone>');
						// 						}
						break;
					case 'selections':
						break;
					case 'labels':
						break;
				}
			}
		}
		if(o1&&o2){
			// insert references into each other's elements
			// Do this by appending <ref target="xml:id"></ref> elements
			var o1ref='<ref target="'+o1.attr('xml:id')+'">'+args[0].type+'</ref>';
			o2.append(o1ref);
			var o2ref='<ref target="'+o2.attr('xml:id')+'">'+args[1].type+'</ref>';
			o1.append(o2ref);
		} else {
			return;
		}
	
	},
	dataDeletedHandle:function(e,obj){
		var self=this;
		
		switch(obj.type.toLowerCase()){
			case 'shapes':
				var $surface=self.$xml.find('surface');
				var found=false;
				$surface.find('zone').each(function(i,o){
					if($(o).attr('xml:id')==obj.id){
						// delete item
						$(o).remove();
					}
				});
				break;
			case 'lines':
				break;
			case 'selections':
				break;
			case 'labels':
				break;
		}
		
	},
	dataUpdatedHandle:function(e,obj){
		var self=this;
		
		
		
	},
	// Takes a given node and returns a string
	// representing the XPath to place in a TEI
	// Pointer element
	createPointerXPath:function(node){
		var self=this;
		if(!node) return;
		// count parents
		var pointer='';
		var up=$(node).parent();
		pointer+='/'+up[0].nodeName;
		while(up.parent()){
			up=up.parent();
			pointer='/'+up[0].nodeName+pointer;
		}
		return pointer;
	},
	// Take the XML that has been edited and output
	outputXML:function(){
		
	}
};

TILE.engine.registerPlugin(CoreData);