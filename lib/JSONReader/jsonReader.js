// jsonReader
var _SCHEMA=null;
var jsonReader=Monomyth.Class.extend({
	init:function(args){
		this.data=args;
		this.schemaFile=null;
		//global listeners
		$("body").bind("schemaLoaded",{obj:this},this.ingestSchemaData); //-listens to ImportDialog
	},
	ingestSchemaData:function(e,schema){
		var obj=e.data.obj;
		if(!obj.schemaFile){
			obj.schemaFile=schema;
			//get the JSON data
			//url,data,function
			$.getJSON(obj.schemaFile,function(d){
				_SCHEMA=[];
				//go through tag objects and create array of tags
				//and their rules
				_SCHEMA.tags=[];
				$.each(d.tags,function(i,tag){
					_SCHEMA.tags.push(tag);
				});
				
				$("body").trigger("tagRulesSet",[_SCHEMA.tags]);
			});
		}
	},
	getImages:function(){
		
	},
	getTags:function(){
		
	},
	getRules:function(){
		
	}
});