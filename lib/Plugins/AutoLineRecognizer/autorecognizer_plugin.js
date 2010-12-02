// AutoRecognizer : A plugin tool for the TILE interface
// developed for MITH and TILE by Doug Reside and Grant Dickie
// 
// Recognize lines in any given image. Takes a given image url, puts it into an SVG canvas,
// then proceeds to convert the image to black and white and analyze the amount of black pixels to
// determine their concentration and figures out where lines and words are located. Then draws div boxes
// around the areas thought to be lines.

// Objects:
// TileOCR - main engine that creates everything
// CanvasImage 
// Shape
// RegionBox
// RegionRule
// lineBox
// AutoRecognizer
// CanvasAutoRecognizer

// Plugs into the tile1.0.js interface. This is done by providing a smaller object, AR, that includes several required functions for a 
// plugin in TILE to have. For more information, see below, where the constructor AR is located. 


(function(){
	var AutoR=this;
	/**
		TileOCR - creates the setup and tools 
		to use the autoRecognizer
		
		Author: Grant Dickie
		MITH 2010
		
		//relies on CanvasAutoRecognizer toolset
		var v = new TileOCR({loc:{String}})
		
		
		args.loc {String} - id for where toolbar is located
		args.transcript {Object} - JSON object containing lines for this url
		
	**/
	var TileOCR=Monomyth.Class.extend({
		// Constructor
		init:function(args){
			//finds it's own location if not given one
			var self=this;
			if(!args.layout) throw "Error setting up autorecognizer";
			var d=new Date();
			self.uid=d.getTime("milliseconds")+"_ar";
			self.canvasArea=$("#azcontentarea > div.az.inner").children("div:not(.toolbar)"); //use this later to put in CanvasImage object
			self.loc=(args.loc)?  $("#"+args.loc):$("div.az.tool:empty");
			self.html=args.layout.autorec;
			self.transcript=(args.transcript)?args.transcript:null;
			if(!self.loc) throw "Error in construction for AutoRecognizer";
			self.lineManifest=[];
			self.curRegion=0;
			self.url=[];
			// set up html
			self._setUp();
			
		},
		// Setting up the HTML for AutoRecognizer
		// Replaces both the Transcript and ActiveBox areas to the left and 
		// replaces canvas area
		// jsonhtml : {Object} JSON object containing strings for autorecognizer HTML 
		// 						elements
		_setUp:function(){
			//set up rest of autorecognizer
			var self=this;
			// self.html=jsonhtml.autorec;
			
			$(self.html).appendTo(self.loc);
			self.DOM=$("div.autorec_toolbar").attr('id',self.uid+"_main");
			//ColorFilter
			self.colorFilterArea=$("#"+self.DOM.attr('id')+" > div.colorSection").attr("id",self.uid+"_CF");
			self.colorFilter=new TileColorFilter({
				DOM:self.colorFilterArea.attr("id"),
				green:"green",
				blue:"blue",
				red:"red",
				colorBox:"backgroundimage"
			});
			self.contentArea=$("#"+self.DOM.attr('id')+" > #content");
			//get areas
			self.regionListBoxDiv=$("#"+self.DOM.attr('id')+" > #content > div.step > div#sidebarContent");
		
			self.transcriptArea=$("#"+self.DOM.attr('id')+" > #content > .step > #transcript");
		
			//get buttons
			self.closeB=$("#"+self.DOM.attr("id")+" > .toolbar > div.menuitem > span.btnIconLarge.close").click(function(e){
				self._outputData();
			});
			self.showBoxB=$("#"+self.DOM.attr('id')+" > #content > div.step > div.buttondiv:nth-child(odd) > #showBox");
			//removing capture button for now
			self.captureB=$("#"+self.DOM.attr('id')+" > #content > div.step > div.buttondiv:nth-child(even) > #captureButton").remove();
			self.nextB=$("#"+self.DOM.attr('id')+" > #content > div.step > div.buttondiv > #nextButton").click(function(e){
				//$(this).trigger("turnPage",[1]);
				self._paginate(1);
			});
			self.prevB=$("#"+self.DOM.attr('id')+" > #content > div.step > div.buttondiv > #prevButton").click(function(e){
				self._paginate(-1);
				//$(this).trigger("turnPage",[-1]);
			});
			self.recognizeB=$("#"+self.DOM.attr('id')+" > #content > div.step > div.buttondiv > #autorec_recognize");
			self.doneB=$("#"+self.DOM.attr('id')+" > #content > div > #done").click(function(e){
				e.preventDefault();
				self._outputData();
			});
			
			self.closeOutB=$("#"+self.DOM.attr('id')+" > #content > span > #clickDone").click(function(e){
				e.preventDefault();
				self._outputData();
			});
			
			self.selectAll=$("#"+self.DOM.attr('id')+" > #content > .step > #transcript_controls > #selectAll");
			self.selectNone=$("#"+self.DOM.attr('id')+" > #content > .step > #transcript_controls > #selectNone");
			self.selectAll.click(function(e){
				e.preventDefault();
				self.transcriptArea.children("div").removeClass("selected").addClass("selected");
			});
			self.selectNone.click(function(e){
				e.preventDefault();
				self.transcriptArea.children("div").removeClass("selected");
			});
			
			//swap out other canvas/image area data for CanvasImage
			self.swapCanvas();
			self._loadTranscript();
			
			
			
			// show the region box automatically
			// $("body:first").trigger("showBox");
		},
		// Sets up CanvasArea - replaces CanvasArea from previous tool
		// and replaces with this Tools' CanvasImage 
		swapCanvas:function(){
			var self=this;
			if(self.canvasArea){
				//hide stuff in canvasArea - except for toolbar
				self.canvasArea.hide();
				var container=self.canvasArea.parent();
				container.animate({opacity:0.25,"background":'red'},400,function(e){
					container.animate({opacity:1,"background":'red'},400,function(e){
						container.css({background:'white'});
					});
				});
				//make canvas
				self.CANVAS=new CanvasImage({
					loc:container
				});
			
				//create region box and put over newly created canvas
				self.regionBox=new RegionBox({loc:container});
				//create canvas auto recognizer to use regionBox above and
				//handle all color conversion/analysis
				self.CAR = new CanvasAutoRecognizer({
					canvas:self.CANVAS.canvas,
			        canvasImage:self.srcImage,
					imageEl: "srcImageForCanvas",
		            regionID: "regionBox"
		        });
				
				//set button listeners
				self.showBoxB.click(function(e){
					e.preventDefault();
					self.regionBox.DOM.show();
					// $(this).trigger("showBox");
				});
				self.captureB.click(function(e){
					e.preventDefault();
					self._capture();
				});
				self.recognizeB.click(function(e){
					e.preventDefault();
					self._recognize();
				});
				//set global listeners
				//when user changes settings on colorfilter, need to reset canvas region
				$("body").bind("ColorChange",{obj:self},self.ColorChangeHandle);
				//when canvas has loaded image, need to load the transcript
				//regionBox dragging/resizing listeners
				//call changeColor each time the box is dragged/resized
				$("body").bind("regionMovedDone",function(e){
					if(self.regionBox.DOM.is(":visible")){
						self.CANVAS._resetCanvasImage();
						self.CAR.thresholdConversion();
					}
				});
				$("body").bind("resizestop",function(e){
					if(self.regionBox.DOM.is(":visible")){
						self.CANVAS._resetCanvasImage();
						self.CAR.thresholdConversion();
					}
				});
			
				var cursrc=$("#srcImageForCanvas").attr('src');
				if(!(cursrc in self.url)) self.url.push($("#srcImageForCanvas").attr("src"));
				//adjust regionBox size
				var newScale=self.DOM.width()/$("#srcImageForCanvas")[0].width;
				
				//change the toolbar
				$("#listView").parent().unbind("click");
				$("#pgNext").unbind("click");
				$("#pgPrev").unbind("click");
			}
		},
		// Once the setUp is run, and the AR has been hidden, call this function 
		// from AR.restart()
		// transcript {Object} - JSON data containing lines for this session
		_restart:function(transcript){
			
			//already constructed, re-attach listeners and show DOM
			var self=this;
			
			if(self.CANVAS) {
				self.regionBox=new RegionBox({loc:"#azcontentarea"});
				self.CAR.Region=$("#regionBox");
				if($("#regionBox").css("display")=="block"){
					$("#regionBox").hide();
				}
				$(".az.main > .az.log").removeClass("log").addClass("tool");
				var n='-='+$(".az.main > .az.tool").width();
				$(".az.main > .az.tool").animate({opacity:0.25,left:n},400,function(e){
					self.DOM.parent().show();
					self.DOM.show();
					
					self.colorFilter.DOM.show();
					self.colorFilter._restart();
					$(this).animate({opacity:1,left:0},200);
				});
				// correct any window size difference
				$("#"+self.CANVAS.uid).width($("#azcontentarea").width());
				$("#"+self.CANVAS.uid).height($("#azcontentarea").height());
				
				if(self.canvasArea){
					self.canvasArea.animate({opacity:0.35},400,function(){
						self.canvasArea.hide();
						self.CANVAS._restart();
						self.canvasArea.animate({opacity:1},200);
					});
				}
				if(transcript){
					
					self.transcript=transcript;
					if(!self.transcript.shapes.push){
						var ag=[];
						for(var x in self.transcript.shapes){
							ag[x]=self.transcript.shapes[x];
						}
						self.transcript.shapes=ag;
						
						
						
					}
					self._loadTranscript();
				}
				

			} 
		},
		// Loads the stored transcript array items into the transcript div
		_loadTranscript:function(){
			var self=this;
			var out="";
			
			if(self.transcript){
				self.transcriptArea.empty();
				for(t in self.transcript.lines){
					//create a selLine object out of transcript item
					var el=$("<div class='trLine selLine' id='trLine"+t+"'>"+self.transcript.lines[t].text+"</div>");
					self.transcriptArea.append(el);
					el.click(function(e){
						if($(this).hasClass("selected")){
							$(this).removeClass("selected");
						} else {
							$(this).addClass("selected");
						}
					});
				}
				// default mode is that all transcript lines are selected
				self.transcriptArea.children("div").removeClass("selected").addClass("selected");
			} 
		},
		// Called by Mouse Drag, Drop, Move and Resize events
		// Changes the threshold using the CanvasAutoRecognizer Object's
		// thresholdConversion()
		// e : {Event}
		// thresh : {Integer} passed integer for how much threshold to use
		// 					in conversion
		ColorChangeHandle:function(e,thresh){
			var self=e.data.obj;
		
			self.CANVAS._resetCanvasImage();
			self.CAR.thresholdConversion();
		
		},
		/**
			Captures the shape/area data and stores it into 
			memory
		**/
		_capture:function(){
			var self=this;
		
			var dims=self.regionBox._getDims();
		    //var rgb = $("#backgroundimage").text();
			var rgb=self.colorFilter._RGB();
			var _d=new Date();
		    //create JSON object that is output after 
			self.regionList={
				"lines":[],
				"shapes":[],
				"links":[],
				"uid":"g"+_d.getTime("seconds"),
		        "left": dims.left,
		        "top": dims.top,
		        "width": dims.width,
		        "height": dims.height,
		        "rgb": rgb,
				"uri":$("#srcImageForCanvas").attr('src')
		    };
		
			self.transcriptArea.children(".selected").each(function(i,o){
				self.regionList["lines"].push(parseInt($(o).attr('id').replace("trLine",""),10));
			});
			//signal to user
			self.regionBox._flash();
		},
		// Uses the CanvasAutoRecognizer functions to recognize pockets of black dots
		// in the image. Parses data into JSON, then sends it to outputData
		// 
		_recognize:function(){
			var self=this;
			if(!self.regionBox) return;
			if(self.regionBox.DOM.css("display")=='none') return;
			self._capture();
			var url=$("#srcImageForCanvas").attr('src');
			if(self.regionList) {
				//add to this region's images
			//	self.regionList[self.curRegion].images.push($("#srcImageForCanvas").attr('src'));
				numOfLines = self.regionList.lines.length;
			    bucket = self.CAR.createLineBreaks(numOfLines);
				bucket.sort(function(a,b){return(a-b);});
				curLinesArray = [];
				
				// figure out the current image scale
				var w=$("#srcImageForCanvas")[0].width;
				var h=$("#srcImageForCanvas")[0].height;
				var scalecorrectx=parseFloat(1/self.CANVAS._scale);
				var scalecorrecty=parseFloat(1/self.CANVAS._scale);
			
				//get the current region 
				var _REG=self.regionList;
				
				var left = _REG.left;
		           
		 		var tbarcorrect=($("#azcontentarea > .az.inner > .toolbar").outerHeight(true)+$("#azcontentarea > .az.inner").scrollTop()+$("#azcontentarea > .az.inner > .workspace").offset().top);
		
				var rtop = _REG.top;
				var alphaTop=_REG.top-tbarcorrect;
				var lastTop = parseInt(alphaTop,10);
				$(".selLine").removeClass("selLine").addClass("recLine");
				//find proportion of canvas image
				var imgdims=self.CANVAS._getPerc(); 
				var ldata=[]; //for sending to the logbar
				var sids=[];
				for (var i = 0; i < bucket.length; i++) {
		        	var top =alphaTop+bucket[i];
					// var outTop=alphaTop+bucket[i];
					var height = parseInt(top,10)-parseInt(lastTop,10);
		            var bb = new lineBox({
	                   width: _REG.width,
	                   height: height,
	                   left: left,
	                   top: lastTop,
	                   loc: self.CANVAS.DOM.parent()
	               	});
					
					lastTop = top;
					jsel = ".recLine:eq("+(i)+")";
				
					$(jsel).attr("id","recLine"+(i)).bind("click",{lineBox: bb},function(e){
						var lb = e.data.lineBox;
						var id = lb.DOM.attr("id");
						e.data.lineBox.select(id);
					});
					var lname=$(jsel).attr('id');
					
					//creating a similar JSON structure to that of the 
					//VectorDrawer structure for loading in shapes
				
					var id=Math.floor(Math.random()*365);
					while($.inArray(id,sids)>=0){
						id=Math.floor(Math.random()*365);
					}
					sids.push(id);
					//change the uid of the lineBox that goes with this 
					$("#lineBox_"+i).attr('id',"lineBox_"+id+"_shape");
				
					//update assoc. transcript tag
					if(self.transcript.lines[i]){
						if(!self.transcript.lines[i].shapes) self.transcript.lines[i].shapes=[];
						if(!self.transcript.shapes) self.transcript.shapes=[];
						//add data to the session's JSON object
						self.transcript.lines[i].shapes.push("D_"+id+"_shape");
						self.transcript.shapes.push({"id":"D_"+id+"_shape","type":"rect","_scale":1,"color":"#FFFFFF","posInfo":{"x":(left*scalecorrectx),"y":((top*scalecorrecty)),"width":(_REG.width*scalecorrectx),"height":(height)*scalecorrecty}});
					}
		        }
				self.regionBox.DOM.hide(); //hide regionBox
				
				
				//output data and close autoRecognizer
				self._outputData();
			}
		},
		// Takes the parsed JSON data from recognize() and 
		// sends it out using 'outputAutoRecData'
		// 
		_outputData:function(){
			var self=this;
			var url=$("#srcImageForCanvas").attr('src');
			$("#srcImageForCanvas").attr("src",url.substring((url.indexOf('=')+1)));
			// output all data found
			if($(".lineBox").length) {
				$("body:first").trigger("outputLines",[{inputTool:"Transcript1000",payload:{lines:self.transcript.lines}}]);
				// goes to imagetagger
				$("body:first").trigger("outputLines",[{data:self.transcript}]);
			}
			
			var n='-='+$(".az.main > .az.tool").width();
			$(".lineBox").remove();
			// TODO: re-introduce animation into this
			self.DOM.parent().hide();
			self.regionBox.DOM.remove();
			
			//remove all the lines from canvas area
			//$(".az.main.threecol").removeClass("threecol").addClass("twocol");
			
			$(".az.main > .az.tool").removeClass("tool").addClass("log");
			self.CANVAS._closeOut();
			
			self.canvasArea.show();
			if(__v){ 
				console.log("self.transcript in autorec:");
				console.log(JSON.stringify(self.transcript));
			}
			$("body:first").trigger("closeOutAutoRec",[{scale:self.CANVAS._scale,data:self.transcript}]);
		}
	});
	
	AutoR.TileOCR=TileOCR;


	/**
	 * Image object that creates a canvas
	 * and loads URL of image inside it
	 * 
	 * Possible functionality:
	 * Can load a series of urls (array-based series) 
	
		Usage:
			new CanvasImage({loc:{jQuery Object}})
	 */
	 var CanvasImage=TILEImage.extend({
	 	// Constructor
		init: function(args){
	 		this.$super(args);
	 		var self=this;
			this.loc = $(this.loc);
			//grab source image 
	 		this.srcImage = $("#srcImageForCanvas");
			
	 		this.loc.append($("<div id=\"canvasHTML"+this.uid+"\" class=\"workspace\"><canvas id=\"canvas\"></canvas></div>"));
			
			// global bind to window to make sure that canvas area is correctly synched w/ 
			// window size
			$(window).resize(function(e){
			
				if($("#"+self.uid).length){
					$("#"+self.uid).width($("#azcontentarea").width());
					$("#"+self.uid).height($("#azcontentarea").height()-$("#azcontentarea > .az.inner > .toolbar").innerHeight());
				}
			});
	
	 		this.DOM = $("#canvasHTML"+this.uid);
			this.DOM.width(this.DOM.closest(".az.content").width());
			this.DOM.height(this.DOM.closest(".az.content").height()-this.DOM.closest(".toolbar").height()).css("overflow","auto");
			
	 		this.canvas = $("#"+this.DOM.attr('id')+" > #canvas");
	 		//need real DOM element, not jQuery object
			this.canvasEl = this.canvas[0];
			this.imageEl = this.srcImage[0];
			this.pageNum = 0;
			this.url = [];
			this.nh = 0;
			this.nw = 0;
			this._scale=1;
			
			this._loadPage=$("<div class=\"loadPage\" style=\"width:100%;height:100%;\"><img src=\"skins/columns/images/tileload.gif\" /></div>");
			
			//whatever is currently in srcImage, load that
			//this.setUpCanvas(this.srcImage.attr("src"));
			$("body").bind("zoom",{obj:this},this.zoomHandle);
			//$("body").bind("closeOutAutoRec",{obj:this},this._closeOut);
		
			
			//stop listening to events after user loads lines
			$("body").bind("linesAdded_",{obj:this},function(e){
				var self=e.data.obj;
				self.canvas.css("pointer-events","none");
			});
			// $("body").bind("SecurityError1000",function(e){
			// 				e.stopPropagation();
			// 				self.setUpCanvas($("#srcImageForCanvas").attr('src'));
			// 				return;
			// 			});
		},
		zoomHandle:function(e,v){
			var self=e.data.obj;
			//v is either greater than 0 or less than 0
			self.canvas[0].width=self.canvas.width();
			if(v>0){
				//zoom in
				var w=self.canvas.width()*1.25;
				var h=self.canvas.height()*1.25;
				self.canvas[0].width=w;
				self.canvas[0].height=h;
				self._scale*=1.25;
				
			} else if(v<0){
				//zoom out
				var w=self.canvas.width()*0.75;
				var h=self.canvas.height()*0.75;
				self.canvas[0].width=w;
				self.canvas[0].height=h;
				self._scale*=0.75;
				
			}
			var nw=$("#srcImageForCanvas")[0].width*self._scale;
			var nh=$("#srcImageForCanvas")[0].height*self._scale;
			$("#srcImageForCanvas").width(nw);
			self.context.drawImage(self.imageEl, 0, 0, ($("#srcImageForCanvas")[0].width*self._scale), ($("#srcImageForCanvas")[0].height*self._scale));
		},
		// Takes a url and sets up the  HTML5 Canvas to this 
		// url
		// url {String} : url to set canvas to
		// ------------------------------------------------------ 
		// IF AN IMAGE IS REMOTELY LOCATED, USE THE PHP SCRIPT TO 
		// LOAD INTO THE CANVAS
		// ------------------------------------------------------
		setUpCanvas: function(url){
			var self = this;
			$("#srcImageForCanvas").hide();
			self.canvas[0].width=0;
			self._loadPage.appendTo(self.DOM);
		
			
			$("#srcImageForCanvas").load(function(e){
				// make sure the image really loaded
				if($(this).attr('src').length==0) {
					$(this).attr('src',url);
					return;
				}
				self._loadPage.remove();
				$("#srcImageForCanvas").show();
				var ow=parseFloat($("#srcImageForCanvas").width());
				var oh=parseFloat($("#srcImageForCanvas").height());
				$("#srcImageForCanvas").css("width","");
				var real_width=$("#srcImageForCanvas")[0].width;
				var real_height=$("#srcImageForCanvas")[0].height;
				
				self.curUrl=$("#srcImageForCanvas").attr("src");
				
				
				self.canvas[0].width = real_width;
				self.canvas[0].height =real_height;
				if(__v) console.log(ow+"/"+real_width+"="+(ow/real_width));
				// self._scale=(ow/real_width);
				self._scale=1;
				
				if(($("#regionBox").width()>real_width)||($("#regionBox").height()>real_height)){
					$("#regionBox").width(real_width-(real_width/4));
					$("#regionBox").height(real_height-(real_height/4));
				}
				self.canvas.attr("width",self.canvas[0].width);
				self.canvas.attr("height",self.canvas[0].height);
			
				self.context=self.canvasEl.getContext('2d');
				self.context.drawImage($("#srcImageForCanvas")[0], 0, 0, self.canvas[0].width, self.canvas[0].height);
				$("#"+self.uid).width($("#azcontentarea").width());
				$("#"+self.uid).height($("#azcontentarea").height()-$("#azcontentarea > .az.inner > .toolbar").innerHeight());
				$(this).unbind("load");
				setTimeout(function(){
					$("#regionBox").show();
				},10);
			});
			// test for remote image and that the url isn't already inserted with the 'PHP'
			if((/file::/.test(url)==false)&&(/PHP\//.test(url)==false)){
				var rootUri = window.location.href;
				rootUri=rootUri.substring(0,rootUri.lastIndexOf("/"));
				url=rootUri+"/PHP/RemoteImgRedirect.php?uimg="+url;
			}
			$("#srcImageForCanvas")[0].src=url;
		},
		//Close Out for CanvasImage
		// hides the container DOM
		_closeOut:function(){
			var self=this;
			$("body").unbind("zoom",self.zoomHandle);
			self.DOM.hide();
		},
		// Shows the container DOM and calls setUpCanvas for 
		// current image
		_restart:function(){
			var self=this;
			self.DOM.show();
			$("body").bind("zoom",{obj:self},self.zoomHandle);
			self.setUpCanvas($("#srcImageForCanvas").attr("src"));
			
		},
		// Re-draws the canvas
		_resetCanvasImage:function(){
			var self=this;
			self.context.drawImage($("#srcImageForCanvas")[0], 0, 0, ($("#srcImageForCanvas")[0].width*self._scale), ($("#srcImageForCanvas")[0].height*self._scale));			
		},
		//get percentage/proportional value of canvas container to canvas
		_getPerc:function(){
			var self=this;
			//Relative Point: the main container of canvas (this.DOM)
			var rp=self.DOM.position();
			var dp=self.canvas.position();
			var l=(dp.left-rp.left);
			var t=(dp.top-rp.top);
			var w=self.canvas.width();
			var h=self.canvas.height();
			
			return {l:l,t:t,w:w,h:h};
		}
	});

		/**
		RegionBox
		
		Author: Grant D.
		
		Taking the HTML from other functions and making it into a single function
		**/
		var RegionBox=Monomyth.Class.extend({
			// Constructor
			init:function(args){
				if(!args.loc) throw "RegionBox cannot be inserted at this point";
				var self=this;
				self.loc=$(args.loc);
				self.DOM=$("<div id=\"regionBox\" class=\"boxer_plainbox\"></div>");
				self.DOM.appendTo(self.loc);
				//adjust top/left
				var p=$("canvas").position();
				self.DOM.css({"left":p.left,"top":(p.top+$("#azcontentarea > .az.inner > .toolbar").innerHeight())});
				
				//draggable and resizable
				self.DOM.draggable({
					start:function(e,ui){
						$("body:first").trigger("regionMoveStart");
					},
					stop:function(e,ui){
						$("body:first").trigger("regionMovedDone");
					}
				});
				self.DOM.resizable({
					handles:'all'
				});
				//listeners
				$("body").bind("zoom",{obj:self},self._zoomHandle);	
			},
			//flashes the box on and off
			_flash:function(){
				var self=this;
				self.DOM.css({
			        "background-color": "red"
			    });
			    self.DOM.animate({
			        "opacity": 0
			    }, 250, function(){
			        self.DOM.css({
			            "background-color": "transparent",
			            "opacity": 1
			        });

			    });
			},
			// Handles the zoom trigger event
			// e : {Event}
			// v : {Integer} - new scale to scale box to
			_zoomHandle:function(e,v){
				var self=e.data.obj;
				//v is either gt 0 or lt 0
				if(v>0){
					//zooming in
					var d=self._getDims();
					var left=(d.left*1.25);
					if(!self.DOM.parent().position()) return;
					var top=(self.DOM.parent().position().top+$("#azcontentarea > .az.inner > .toolbar").innerHeight()+10)+5;
					var nWdt=(d.width*1.25);
					var nHgt=(d.height*1.25);
					var pWdt=(self.DOM.parent().width());
					var pHgt=(self.DOM.parent().height());
					if(left<=self.DOM.parent().position().left){
						left=self.DOM.parent().position().left+5;
					}
					// if(top<=(self.DOM.parent().position().top+$("#azcontentarea > .az.inner > .toolbar").innerHeight()+10)){
					// 						top=(self.DOM.parent().position().top+$("#azcontentarea > .az.inner > .toolbar").innerHeight()+$("#azcontentarea > .az.inner > .toolbar").innerHeight());
					// 					}
					if((nWdt>pWdt)||(nHgt>pHgt)){
						nWdt=pWdt-(pWdt/4);
						nHgt=pHgt-(pHgt/4);
					}
					self.DOM.css({"left":(d.left*1.25)+'px',"top":(top*1.25)+'px',"width":(nWdt),"height":(nHgt)});
				} else if(v<0){
					var d=self._getDims();
					var top=(d.top*0.75);
					if(!self.DOM.parent().position()) return;
					if(top<=(self.DOM.parent().position().top+$("#azcontentarea > .az.inner > .toolbar").innerHeight()+10)){
						
						top=(self.DOM.parent().position().top+$("#azcontentarea > .az.inner > .toolbar").innerHeight()+$("#azcontentarea > .az.inner > .toolbar").innerHeight());
					}
					self.DOM.css({"left":(d.left*0.75)+'px',"top":(top*0.75)+'px',"width":(d.width*0.75),"height":(d.height*0.75)});
				}
			},
			// Toggles the container DOM either on or off
			// Called by 'showBox' event
			// e : {Event}
			_onOff:function(e){
				
				if($("#regionBox").is(":visible")){
					$("#regionBox").hide();
				} else {
					$("#regionBox").show();
				}
			},
			//returns the dimensions needed for a region:
			// left
			// 			top
			// 			width
			// 			height
			_getDims:function(){
				var self=this;
				var pos=self.DOM.position();
				// var totWidth = self.DOM.parent().width();
				// 		    var totHeight = self.DOM.parent().height();
			    var left = pos.left;
			    var top = pos.top;
			    var width = self.DOM.width();
			    var height = self.DOM.height();
				//only need left,top,width,height
				return {left:left,top:top,width:width,height:height};
			},
			// Take passed scale and change left, top, width, and height using this scale
			// scale : {Integer}
			_adjustSize:function(scale){
				var self=this;
				self.DOM.css({"left":(self.DOM.position().left*scale),"top":(self.DOM.position().top*scale),"width":(self.DOM.width()*scale),"height":(self.DOM.height()*scale)});
			},
			// Hide the container DOM - called by closeOutAutoRec
			// e : {Event}
			_closeOut:function(e){
				var self=e.data.obj;
				self.DOM.hide();
			}
		});
		
		
		//SHAPE
		/**
		Shape 

		Created by: dreside

		Object that houses a collection of dot coordinates taken from an HTML canvas
		element.
		Stores x,y coordinates and organizes dots from their left-right, bottom-top positions


		**/
		var Shape = Monomyth.Class.extend({
			// Constructor
			init:function(args){
				this.coords=[];
				this.index=args.index;
				this.Top=args.initialTop;
				this.Right=0;
				this.Left=args.initialLeft;
				this.Bottom=0;
				this.hMid = 0; // horizontal midpoint
				this.vMid = 0; // vertical midpoint
				this.foundOnRow = parseInt(args.foundOnRow.substring(1),10);

			},
			// Add an xy value, which is processed into the Shape object's 
			// coords array
			// xy : {Object} - array of x and y pair
			add: function(xy){
				//add new xy value to coords array
				this.coords.push(xy);
				var x =parseInt(xy.x.substring(1),10); 
				var y =parseInt(xy.y.substring(1),10); 
				//check to make sure greatest left,top,right,bottom points
				//are updated
				if (x < this.Left) {
					this.Left = x;
				}
				if (x > this.Right) {
					this.Right = x;
				}
				if (y > this.Bottom) {
					this.Bottom = y;
				}
				if (y < this.Top) {
					this.Top = y;
				}


			},

			// @param
			// 	shape: Another Shape object to compare this one to
			// returns true of false
			compare:function(shape,criteria){
				return (this[criteria]<shape[criteria]);
			}
		});
		
		//COLORFILTER
		var ColorFilter=Monomyth.Class.extend({
			// Constructor
			init:function(args){
				//overwritten by child classes
			}
		});
		/*
		 * args:
		 * 		DOM: DOM id of container
		 * 		red: DOM id of div for red slider
		 * 		green: DOM id of div for greeen slider
		 * 		blue:  DOM id of div for blue slider
		 * 		colorBox: DOM id of div showing color 		
		 * 		
		 */
		var TileColorFilter=ColorFilter.extend({
			// Constructor
			init:function(args){
				this.$super(args);
				this.DOM = $("#"+args.DOM);
				this.red = args.red;
				this.green = args.green;
				this.blue = args.blue;
				var colorBox = args.colorBox;
				this.rgbDiv = $("#"+colorBox);
				this.rgbValue=[127,127,127];
				
				$("body").bind("slideChange",{obj:this},this.changeColorFromSlider);
				
				this.redSlide=$("#"+this.red).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						$(this).trigger("slideChange",["red",ui.value]);
					}
				});
				this.greenSlide=$("#"+this.green).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						$(this).trigger("slideChange",["green",ui.value]);
					}
				});
				this.blueSlide=$("#"+this.blue).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						
						$(this).trigger("slideChange",["blue",ui.value]);
					}
				});
				
				this.DOM.bind("slideChange",{obj:this},this.changeColorFromSlider);
				rgb = this.rgbValue.toString();
				this.rgbDiv.text(rgb);
				this.rgbDiv.css("background-color","rgb("+rgb+")");
				this.DOM.trigger("ColorChange",[rgb]);
			},
			// Resets all of the sliders back to default values
			_restart:function(){
				this.redSlide=$("#"+this.red).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						$(this).trigger("slideChange",["red",ui.value]);
					}
				});
				this.greenSlide=$("#"+this.green).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						$(this).trigger("slideChange",["green",ui.value]);
					}
				});
				this.blueSlide=$("#"+this.blue).slider({
					min:0,
					max:255,
					value: 127,
					stop:function(e,ui){
						
						$(this).trigger("slideChange",["blue",ui.value]);
					}
				});
				this.DOM.bind("slideChange",{obj:this},this.changeColorFromSlider);
				this.DOM.trigger("ColorChange",[rgb]);
			},
			// Takes a given rgb value as input and sets the sliders and rgbDiv to
			// this value
			// rgb : {String} - string representing color values for red, green, blue
			setValue: function(rgb){
				this.rgbDiv.text(rgb);
				this.rgbDiv.css("background-color","rgb("+rgb+")");
				colors = rgb.split(",");


				$("#"+this.red).slider("option","value",colors[0]);
				$("#"+this.green).slider("option","value",colors[1]);
				$("#"+this.blue).slider("option","value",colors[2]);
			},
			// Called by slideChange event
			// Sets the rgbValue array to the appropriate val, depending
			// on which color value was passed
			// e : {Event}
			// color : {String} - (red,green,blue) - color to change
			// val : {Integer} - new color amount for that color
			changeColorFromSlider:function(e,color,val){

				var obj=e.data.obj;
				//debug("color "+color);
				switch(color){
					case "red":
						obj.rgbValue[0]=parseInt(val,10);
						break;
					case "green":
						obj.rgbValue[1]=parseInt(val,10);
						break;
					case "blue":
						obj.rgbValue[2]=parseInt(val,10);
						break;
				}
				var rgb=obj.rgbValue[0]+","+obj.rgbValue[1]+","+obj.rgbValue[2];

				obj.rgbDiv.text(rgb);
				obj.rgbDiv.css("background-color","rgb("+rgb+")");
				$("body:first").trigger("ColorChange",[rgb]);

			},
			// Returns {String} from rgbDiv
			_RGB:function(){
				var self=this;
				return self.rgbDiv.text();
			}
		});
			
		//REGION RULE
		// Object representing an array of values 
		// related to a region of an image to recognize
		var RegionRule=Monomyth.Class.extend({
			// Constructor
			init:function(args){
				/*
				 * args:
				 * 		move: Enum type [stay|next|prev] which directs whether to change the page
				 * 		top: % from top of image
				 * 		left: %
				 * 		height: %
				 * 		width: %
				 * 		
				 */
				this.move = args.move;
				this.top = args.top; 
				this.left = args.left;
				this.height = args.height;
				this.width = args.width;

			}
		});
		// LineBox
		// box that appears on the image after 
		// recognizing lines. represents a recognized line
		// Usage: new lineBox({width:{Integer},height:{Integer},left:{Integer},top:{Integer}});
		var lineBox=Monomyth.Class.extend({
			// Constructor
			init:function(args){
				var self=this;
				self.DOM=$("<div class=\"lineBox\"></div>").attr("id","lineBox_"+$(".lineBox").length);
				self.uid=self.DOM.attr('id');
				//add Options
				self.resizeOn=false;
				self.dragOn=false;
				//has settings based on SHAPE_ATTRS
				self.DOM.width(args.width);
				self.DOM.height(args.height);
				self.DOM.css("left",args.left+'px');
				self.DOM.css("top",args.top+'px');
				if(SHAPE_ATTRS) self.DOM.css(SHAPE_ATTRS);
				
				self.DOM.appendTo(args.loc);
				self.optionsON=false;
				$("#"+self.uid).bind("mouseover",function(e){
					$(this).addClass("lineBoxSelect");
				});
				$("#"+self.uid).bind("mouseout",function(e){
					$(this).removeClass("lineBoxSelect");
					
				});
				$("#"+self.uid).bind("click",function(e){
					var id = $(this).attr("id");
					self.select(id);
				});
			//	self.DOM.bind("doneEdit",{obj:self},self.unselect);
				//global listener for zoom
			//	$("body").bind("zoom",{obj:this},self.zoomHandle);
			},
			// select this linebox - immediately becomes draggable and
			// resizeable
			// id : {String}
			select:function(id){
				$(".lineBox").css({"display":"none"});
				$("#"+id).css({"display":"block"});
				$("#"+id).draggable();
				$("#"+id).resizable();
				
				$("#"+id).trigger("lineClicked",[id]);
			},
			// Handles zoom trigger
			// e : {Event} 
			// v : {Integer} - scale to scale to
			zoomHandle:function(e,v){
				var self=e.data.obj;
				if(v<0){
					//zooming out 
					var w=self.DOM.width()*0.75;
					var h=self.DOM.height()*0.75;
					var l=self.DOM.position().left*0.75;
					var t=self.DOM.position().top*0.75;
					self.DOM.css({"width":w+'px',"height":h+'px',"left":l+'px',"top":t+'px'});
				
				} else if(v>0){
					//zooming in
					var w=self.DOM.width()*1.25;
					var h=self.DOM.height()*1.25;
					var l=self.DOM.position().left*1.25;
					var t=self.DOM.position().top*1.25;
					self.DOM.css({"width":w+'px',"height":h+'px',"left":l+'px',"top":t+'px'});
					
					//self.DOM.css({"left":l+'px',"top":t+'px'});
				}
			}
		});
			
			// Parent Class
			// AutoRecognizer
			// 
			// All AutoRecognizer Objects contain data and shape arrays
			var AutoRecognizer=Monomyth.Class.extend({
				// Constructor
				init:function(args){
					this.data=[];
					this.shapes=[];
				}
				// Sub-Classes extend functionality
			});

			/**
			CanvasAutoRecognizer

			Functions:
			init (constructor)
			getRegion - receives values from Image object
			thresholdConversion
			filterDots
			createLineBreaks
			convertShapesToLines
			cleanLineBreaks
			colorLineBreaks

			listens for:
			RegionSet
			
			Usage: 
			new CanvasAutoRecognizer({regionID:{String},dotMin:{Integer},dotMax:{Integer}});
			
			regionID {String} - ID for RegionBox
			dotMin {Integer} - minimum dots per line
			dotMax {Integer} - maximum dots per line
			**/

			var CanvasAutoRecognizer=AutoRecognizer.extend({
				// Constructor
				init:function(args){
					this.$super(args);
					// args:
					// Region: Region of image
					this.dots=[];
					this.numOfLines=40;
					//$("#numOfLines")[0].value;
					this.minLineHeight=5;
					this.canvasImage=args.obj;
					this.canvas=args.canvas;
					this.Region=$("#"+args.regionID);
					this.regionData=null;
					this.bdrows = []; // Array of total black dots in each row
					this.bdcols = []; // Array of total black dots in each column
					this.maxes = []; // Array of row #s that represent peaks of dots
					this.mins = []; // Array of row #s that represent troughs of dots
					this.dotMatrix = [];
					this.dotMin=(args.dotMin)?args.dotMin:5;
					this.dotMax=(args.dotMax)?args.dotMax:1000;
					this.bkGrnd="(0,0,0)";
					this.imageEl=$("#"+args.imageEl);
					this.context=this.canvas[0].getContext('2d');
					this.selAverage="CCCCCC";
				},
				// Conversion of region of image to black and white
				// threshold {Integer} - threshold for BW conversion
				thresholdConversion:function(){
				
					var threshold=$("#backgroundimage").text();
				
						
					this.dotMatrix=[];  
				
					this.Region = $("#"+this.Region.attr("id"));
					this.context = $("#canvas")[0].getContext('2d');
					if(this.Region){
						
						this.dots=[]; //resets main dot matrix
						//divide the rbg color value into parts

						data=threshold.split(',');

						var selred=parseInt(data[0],10);	  
				     	var selgreen=parseInt(data[1],10);
				     	var selblue=parseInt(data[2],10);	
				     	threshold=(selred+selgreen+selblue)/3;
						
						var rl = this.Region.offset().left-this.canvas.offset().left;
						var rt = this.Region.offset().top-this.canvas.offset().top;
						
						var rw = this.Region.width();
						var rh = this.Region.height();
						// test to make sure region is within the bounds
				
				
						if((rl<0)||(rt<0)||(rw<0)||(rh<0)) return;
						var pl=$(".workspace:first").position().left;
						var pt=$(".workspace:first").position().top;
						if((pl>rl)||(pt>rt)){
							rl=pl;
							rt=pt;
						}
						if(((pt+$(".workspace:first").height())<(rt+rh))||((pl+$(".workspace:first").width())<(rl+rw))){
							var pldiff=(rl+rw)-(pl+$(".workspace:first").width());
							var ptdiff=(rt+rw)-(pt+$(".workspace:first").height());
							rw-=pldiff;
							rh-=ptdiff;
						}
			
						//get canvas imageData
						if(!this.regionData){
							if(__v) console.log("no region data");
							try{
								if(__v) console.log("context is: "+this.context);
								this.regionData=this.context.getImageData(rl, rt, rw, rh); 
						
							
							} catch(e) {
								
								if(__v) console.log("error reached in threshconversion: "+e);
								// problem with getting data - handle by upgrading our security clearance
								// netscape.security.PrivilegeManager.enablePrivilege("UniversalBrowserRead");
								// this.regionData=this.context.getImageData(rl, rt, rw, rh); 
								// $("body:first").trigger("SecurityError1000");
								return;
							}
						} else {
							//create a blank slate - somehow 'createImageData' doesn't work in this case
							//var zoomData=this.canvasImage.getZoomLevel();
						
							this.context.drawImage(this.imageEl[0], 0, 0, this.imageEl.width(),this.imageEl.height());
							//find new regionData from same or different coordinates (if user set new coordinates with 'convertBW' button)
							try{
								this.regionData=this.context.getImageData(rl, rt, rw, rh); 
							} catch(e) {
								// problem with getting data - handle by upgrading our security clearance
								// netscape.security.PrivilegeManager.enablePrivilege("UniversalBrowserRead");
								// this.regionData=this.context.getImageData(rl, rt, rw, rh); 
								// New Solution: re-draw the canvas and return function - makes the area not appear
								  // in black and white, but the user can still click 'Go' and get data
								
								this.regionData=null;
								this.context.drawImage(this.imageEl[0], 0, 0, (this.canvas.width()),(this.canvas.height()));
								return;
								// this.thresholdConversion(threshold);
								// $("body:first").trigger("SecurityError1000");
								// return;
							}						
						}
							
					 	var total = 0;
						//CREATING this.dots array matrix
						//GOING HORIZONTAL TO VERTICAL
						for (var j=0; j<rh; j++){
							this.bdrows["R"+j]=0;
						  for (var i=0; i<rw; i++){
							this.bdcols["C"+i]=0;
						     var index=(i +j*rw)*4;
							 var red=this.regionData.data[index];	  
						     var green=this.regionData.data[index+1];
						     var blue=this.regionData.data[index+2];	  
						     var alpha=this.regionData.data[index+3];	 
						     var average=(red+green+blue)/3;
							 adiff = Math.abs(average-threshold);
				 			if (!(this.dotMatrix[j])){
								this.dotMatrix[j]=[];
							}
							this.dotMatrix[j][i]= average;


							if (average>threshold){
								//turn white
						   	 	this.regionData.data[index]=255;	  
							    this.regionData.data[index+1]=255;
							    this.regionData.data[index+2]=255;
							    this.regionData.data[index+3]=alpha;
							}	
							else{
								//turn black
							 	this.regionData.data[index]=0;	  
							    this.regionData.data[index+1]=0;
							    this.regionData.data[index+2]=0;
							    this.regionData.data[index+3]=alpha;
								//add to large array
								if((this.dots["D"+j]==null)){
									this.dots["D"+j]=[];
								}
								this.bdcols["C"+i]++;
								this.bdrows["R"+j]++;

								this.dots["D"+j]["D"+i]=0;
								total++;
							} 

						  }



						}
				 		//convert area to black and white using putImageData
						this.context.putImageData(this.regionData,rl,rt);

					}
				},
				// Takes dotMatrix array and figures out median
				// threshold
				medianThreshold: function(){
					
					var newMatrix = [];
					for (var i=0;i<this.dotMatrix.length;i++){
						newMatrix[i]=[];
						newMatrix[i][0] = this.dotMatrix[i][0];
					}
					for (var i=0;i<this.dotMatrix[0].length;i++){
						newMatrix[0][i] = this.dotMatrix[0][i];
					}
					
					for(var y=1;y<this.dotMatrix.length-1;y++){
						newMatrix[y] = [];
						for (x=1;x<this.dotMatrix[y].length-1;x++){

							//var surrounding=[];
							var white = 0;
							var black =0;

							for (var i = -1; i < 2; i++) {
								for (var j = -1; j < 2; j++) {
											if (this.dotMatrix[(i+y)][(j+x)]<this.selAverage){
												black++;
											}
											else{
												white++;
											}
											//surrounding.push(this.dotMatrix[(i+y)][(j+x)]);


								}
							} 
							
							if (black>2){
								newMatrix[y][x]=1; // white
							}
							else{
								newMatrix[y][x]=0; //black
							} 
						}
					}

					this.paintFromDotMatrix(newMatrix);
				},
				// Take the image and turn each pixel either 
				// white or black, depending on results from medianThreshold
				// matrix {Object} - Array representing black and white pixels (from medianThreshold)
				paintFromDotMatrix: function(matrix){
					
					for (j=0;j<matrix.length;j++){
						if (!(matrix[j])){
							matrix[j]=[];
						}
						for (i=0;i<matrix[j].length;i++){
							if (!(matrix[j][i])){
								matrix[j][i]=0;
							}
							 var index=(i +j*this.Region.w)*4;



							if (matrix[j][i]==1){

								//turn black
							 	this.regionData.data[index]=255;	  
							    this.regionData.data[index+1]=0;
							    this.regionData.data[index+2]=0;
							  //  this.regionData.data[index+3]=alpha;
								//add to large array
								if((this.dots["D"+j]==null)){
									this.dots["D"+j]=[];
								}
								this.bdcols["C"+i]++;
								this.bdrows["R"+j]++;

								this.dots["D"+j]["D"+i]=0;
								//$("#testnotes").append("<p>D"+j+" D"+i+" inserted into dots :: "+" this.dots[D"+j+"][D"+i+"]="+this.dots["D"+j]["D"+i]);
								//total++;
							}
								else{ 
									//turn white
						   	 	this.regionData.data[index]=255;	  
							    this.regionData.data[index+1]=255;
							    this.regionData.data[index+2]=255;
							  //  this.regionData.data[index+3]=alpha;
							}	
						}
						this.context.putImageData(this.regionData,this.Region.ox,this.Region.oy);
					}
				},
				//take shapes and cancel out the ones with coords fewer
				//than this.dotMin
				noiseCanceler:function(){
					MIN=this.dotMin;

					var temp=jQuery.grep(this.shapes,function(el,i){

						return ((el)&&(el.coords.length>MIN));
					});
					this.shapes=temp;
					//update shape indexes
					jQuery.each(this.shapes,function(i,el){
						el.index=i;
					});
					

				},
				// Creates the linebreak array
				// attach {Object} - DOM element to attach to
				convertShapesToLines:function(attach){
					
					if((this.shapes.length>0)&&this.Region){
						//create linebreak array
						//this.sortShapes("foundOnRow");
						this.createLineBreaks();

					}
				},
				//create a smaller object that houses all of the
				//recognizer data for this particular instance
				//narrow down region to its original size
				storeData:function(){
				
					var zoom=this.canvasImage.getZoomLevel();
					var ox=this.Region.ox/(Math.pow(2,zoom));
					var oy=this.Region.oy/(Math.pow(2,zoom));
					var w=this.Region.w/(Math.pow(2,zoom));
					var h=this.Region.h/(Math.pow(2,zoom));


					this.data={
						region:{ox:ox,oy:oy,w:w,h:h}
					};

				},
				// 
				adjustBlobBoxes:function(){
					var data=this.canvasImage.getZoomLevel();
					var blobs=$(".blobbox");
					if(blobs.length>0){
						if((data.zoomLevel>0)&&(data.zoomLevel<5)){
							for(b=0;b<blobs.length;b++){
								var blob=$(blobs[b]);
								var left=((parseInt(blob.css("left"),10))*data.size[0])/data.psize[0];
								var top=((parseInt(blob.css("top"),10))*data.size[1])/data.psize[1];
								var w=(blob.width()*data.size[0])/data.psize[0];
								var h=(blob.height()*data.size[1])/data.psize[1];
								blob.width(w);
								blob.height(h);
								blob.css("left",left+'px');
								blob.css("top",top+'px');
							}
						}
					}
				},
				sortShapes:function(sortAttribute) {
					//debug("sortShapes");
				// DLR: From myBubbleSort function @ http://www.irt.org/articles/js054/index.htm
			    for (var i=0; i<(this.shapes.length-1); i++)
			        for (var j=i+1; j<this.shapes.length; j++)
					    ////debug("sorting "+i+","+j);
			            if (this.shapes[j][sortAttribute] < this.shapes[i][sortAttribute]) {
			                var dummy = this.shapes[i];
			                this.shapes[i] = this.shapes[j];
			                this.shapes[j] = dummy;
			            }
				},

				createLineBreaks:function(numOfLines){
					//creates linebreaks array from shapes array

					linebreaks=[];
					lineinfo = [];
					lineinfoSize = 0;
					maxes = [];
					mins = [];
			/* Experimental stuff*/
					var OrderByDots = [];
					var OrderByRows = [];
					i=0;
					// Create iterative array
					for (var n in this.bdrows){
						OrderByDots[i]={
							row: n,
							num: this.bdrows[n]
						};
						OrderByRows.push(parseInt(this.bdrows[n],10));
						i++;
					}

					for (var i = 0; i < (OrderByDots.length - 1); i++) {
						for (var j = i + 1; j < OrderByDots.length; j++) {
							////debug("sorting "+i+","+j);
							if (OrderByDots[j]["num"] < OrderByDots[i]["num"]) {
								var dummy = OrderByDots[i];
								OrderByDots[i] = OrderByDots[j];
								OrderByDots[j] = dummy;
							}
						}
					}
					var lastRow = 0;
					var bucket = [];
					var i=0;
					//debug("medIndex: "+Math.floor(OrderByRows.length/2));
					var median = OrderByDots[Math.floor(OrderByRows.length/2)].num;
					//debug("median: "+median);
					while ((bucket.length<numOfLines) && (i<OrderByDots.length)){
						var r = parseInt(OrderByDots[i]["row"].substring(1),10);
						var j = 0;
						while((j<bucket.length) && (Math.abs(r-bucket[j])>this.minLineHeight)){
							j++;
						}
						if (j==bucket.length){
							var blackLines = 0;
							var lastFew = r;
							if (r > 6) {
								lastFew = 6;
							}

								for (var k = (r - lastFew); k < r; k++) {
								
									if (OrderByRows[k] > median) {
										blackLines++;
									}
								}
								
								if (blackLines > 2) 
								{

									bucket.push(r);
								}


						}
						i++;
					}
					return bucket;
					},
				addLineBreak:function(e){

				},
				colorLineBreaks:function(imageEl){
					for(y in this.dots){
						var row=parseInt(y.substring(1),10);
						for(x in this.dots[y]){
							var col=parseInt(x.substring(1),10);
							var shape=this.dots[y][x];
							color = 4;
							if (this.shapes[shape]) {
								var forow = parseInt(this.shapes[shape].foundOnRow,10);

								//if (jQuery.inArray(shape,this.lineBreaks)>0){
								var index = (col + row * this.Region.w) * 4;
								var alpha = this.regionData.data[index + 3];
								//var odd=((forow%2)==0);
								var color = (forow % 3);
							//even, it gets a red value, ODD, gets a GREEN value
							}	
								this.regionData.data[index] = (color == 0) ? 255 : 0;
								this.regionData.data[index + 1] = (color == 1) ? 255 : 0;
								this.regionData.data[index + 2] = (color == 2) ? 255 : 0;
								this.regionData.data[index + 3] = alpha;

							//}
						}
					}
					//change colors
					var	nh = (parseInt(imageEl.height,10)*1000)/parseInt(imageEl.width,10);
					this.context.putImageData(this.regionData,this.Region.ox,this.Region.oy);
				}

			});
		
})();


// Plugin for TILE_ENGINE
// AutoRecognizer - AR plugin
// Contains properties and functions that follow the TILE interface plugin protocol
// 
var AR={
	id:"AR1000",
	// Calls constructor for AutoRecognizer and passes
	// variables
	// id {String} - ID for parent DOM
	// data {Object} - JSON data with transcript lines
	// layout {String} : HTML layout in string format
	start:function(id,data,layout){
		var self=this;
		if(!data.lines) data=data[$("#srcImageForCanvas").attr('src')];
		if(!id) id="az_log";
		$("#az_activeBox").hide();
		$(".toolbar > ul > li > #pgPrev").hide();
		$(".toolbar > ul > li > #pgNext").hide();
		$(".toolbar > ul > li > #pointer").hide();
		$(".toolbar > ul > li > a > #listView").parent().hide();
		$(".toolbar > ul > li > #rect").parent().parent().hide();
		this.__AR__=new TileOCR({loc:id,transcript:data,layout:layout});
		
		$("body").bind("outputLines",{obj:self},function(e,data){
			data.tool=self.id;
			
			$("body:first").trigger(self.outputCall,[data]);
		});
		
	},
	json:"autorec.json",
	constructed:false,
	name:"Auto Line Recognizer",
	done:"closeOutAutoRec",
	outputCall:"outputAutoRecData",
	
	// Called by TILE_ENGINE once start() has already been called and 
	// constructed set to true
	// arjson {Object} : JSON object with transcript lines
	// args {Object} : array of optional parameters to pass to constructor
	
	restart:function(arjson,args){
		$(".toolbar > ul > li > #pgPrev").hide();
		$(".toolbar > ul > li > #pgNext").hide();
		$(".toolbar > ul > li > #pointer").hide();
		$(".toolbar > ul > li > a > #listView").parent().hide();
		$(".toolbar > ul > li > #rect").parent().parent().hide();
		$("#srcImageForCanvas").hide();
		// make sure we have correct arjson data
		if (!arjson.lines) {
		
			arjson = arjson[$("#srcImageForCanvas").attr("src")];
		};
		
		//already constructed, initiate main engine restart function
		this.__AR__._restart(arjson,args);
	},
	// Optional function to call that will trigger the _close 
	// custom event
	close:function(){
		var self=this;
		self.__AR__._outputData();
		self.__AR__.regionBox.DOM.hide();
		
		
		// $("body:first").trigger(self._close);
	},
	inputData:function(data){
		
	},
	removeData:function(data){
		
	},
	getLink:function(){
		return false;
	},
	// optional function that takes a JSON Object {j} and returns 
	// this object with additional data retrieved  by the plugin - if
	// any
	bundleData:function(j){
		//empty
		return j;
	},
	// Name for the optional Custom Event for when the plugin has 
	// fully closed down
	_close:"closeOutAutoRec"
};