(function ($, R, _) {
	var rootNS = this;
	var TOO_SMALL = 2;
	var CLOSE_ENOUGH = 8;
	var EPSILON = 10e-6;
	// TODO: make these configurable
	var INIT_ATTRS = {"stroke-width": "1px", "stroke": "#a12fae"};
	var SELECTED_ATTRS = {"stroke-width": "1px", "stroke": "#ff6666"};

	function makePathStr(ps) {
		return "M " + _.map(ps, function(p) {return p.x + " " + p.y;}).join(" L ");
	}

	function whereLinesIntersect(a1, a2, b1, b2) {
		var bXdiff = b1.x-b2.x, bYdiff = b1.y-b2.y;
		var aXdiff = a1.x-a2.x, aYdiff = a1.y-a2.y;
		var aDet = a1.x*a2.y - a1.y*a2.x, bDet = b1.x*b2.y - b1.y*b2.x,
			denom = aXdiff*bYdiff - aYdiff*bXdiff;
		var interX = (aDet*bXdiff - aXdiff*bDet)/denom,
			interY = (aDet*bYdiff - aYdiff*bDet)/denom;
		return {x: interX, y: interY};
	}

	// given the endpoints (a1,a2,b1,b2) of two line segments,
	// determine if they intersect
	function lineSegsIntersect(a1, a2, b1, b2) {
		var i = whereLinesIntersect(a1, a2, b1, b2);
		// check if it's within the segment
		return i.x > _.min([a1.x,a2.x]) && i.x < _.max([a1.x,a2.x]) &&
			i.y > _.min([a1.y,a2.y]) && i.y < _.max([a1.y,a2.y]) &&
			i.x > _.min([b1.x,b2.x]) && i.x < _.max([b1.x,b2.x]) &&
			i.y > _.min([b1.y,b2.y]) && i.y < _.max([b1.y,b2.y]);
	}

	function eachPoint(pathStr, func) {
		// copy without the beginning "M " or ending " z", then split on " L "
		var parts = pathStr.substr(2, path.length-4).split(" L ");
		var np = makePathStr(_.map(parts, function(p){
			var xy = p.split(" ");
			return func({x: xy[0]*1, y: xy[1]*1});
		}));
		return np + " z";

	}

	function shiftShape(o, shift) {
		var ret = {con: o.con, scale: o.scale};
		if (o.con == "rect") {
			ret.x = o.x + shift.x;
			ret.y = o.y + shift.y;
			ret.width = o.width;
			ret.height = o.height;
			ret.args = [ret.x, ret.y, ret.width, ret.height];
		} else if (o.con == "ellipse") {
			ret.cx = o.cx + shift.x;
			ret.cy = o.cy + shift.y;
			ret.rx = o.rx;
			ret.ry = o.ry;
			ret.args = [ret.cx, ret.cy, ret.rx, ret.ry];
		} else if (o.con == "path") {
			ret.points = _.map(o.points, function (p) {
				return {x: p.x+shift.x, y: p.y+shift.y};
			});
			ret.args = [makePathStr(ret.points) + " z"];
		} else {
			throw "should not be reached";
		}
		return ret;
	}

	function relScale(vd, o) {
		return vd._scale/o.scale;
	}

	function pointDistSq(a, b) {
		var dx = a.x-b.x, dy = a.y-b.y;
		return dx*dx + dy*dy;
	}

	function pointNearLineSegment(l, p) {
		// easy case: we're within range of the endpoints
		if (_.any(l, function (lp) {
				return pointDistSq(lp, p) < CLOSE_ENOUGH*CLOSE_ENOUGH;
			}))
			return true;

		// calculate nearest point on the line (point such that it
		// and the queried point form a line segment orthogonal to
		// the queried line segment)
		var ldx = l[0].x-l[1].x, ldy = l[0].y-l[1].y;
		var lslope = ldx/ldy;

		var dump; // dummy point
		if (isFinite(lslope)) {
			dump = (lslope < EPSILON && lslope > -EPSILON) ?
				{x: p.x + 10, y: p.y} : {x: p.x - 10*lslope, y: p.y+10};
		} else {
			dump = {x: p.x, y: p.y + 10};
		}

		var i = whereLinesIntersect(l[0], l[1], dump, p);

		// is this point actually within the queried line segment?
		if (i.x < _.min([l[0].x, l[1].x]) ||
			i.x > _.max([l[0].x, l[1].x]) ||
			i.y < _.min([l[0].y, l[1].y]) ||
			i.y > _.max([l[0].y, l[1].y]))
			return false;

		return pointDistSq(i, p) < CLOSE_ENOUGH*CLOSE_ENOUGH;
	}

	function pointDistFromEllipse(po, eo) {
		// algorithm described in
		// "Quick computation of the distance between a point and an ellipse"
		// by L. Maisonobe <luc@spaceroots.org>
		// September 2003, revised May 2005, minor revision February 2006

		var one_third = 1/3;
		var cube_root = function(n) {
			var cube_root_abs_n = Math.pow(Math.abs(n), one_third);
			return n < 0? -cube_root_abs_n : cube_root_abs_n;
		};

		// ae = major axis
		// ap = minor axis
		// r = distance from center along major axis
		// z = distance from center along minor axis
		var ae, ap, r, z;
		if (eo.rx > eo.ry) {
			ae = eo.rx;
			ap = eo.ry;
			r = po.x-eo.cx;
			z = po.y-eo.cy;
		} else {
			ae = eo.ry;
			ap = eo.rx;
			r = po.y-eo.cy;
			z = po.x-eo.cx;
		}
		// by symmetry, we don't care about signs
		r = Math.abs(r);
		z = Math.abs(z);

		// f = flattening
		var f = 1 - ap/ae;
		var one_minus_f_sq = Math.pow((1-f), 2);

		var p_dist_center = Math.sqrt(r*r + z*z);

		// near center requires special handling
		if (p_dist_center < EPSILON)
			return ap;

		var cos_zeta = r/p_dist_center,
			sin_zeta = z/p_dist_center,
			t = z/(r + p_dist_center);
		var a = one_minus_f_sq*cos_zeta*cos_zeta + sin_zeta*sin_zeta,
			b = one_minus_f_sq*r*cos_zeta + z*sin_zeta,
			c = one_minus_f_sq*(r*r - ae*ae) + z*z;
		var k = c/(b + Math.sqrt(b*b - a*c));
		var phi = Math.atan2(z - k*sin_zeta, one_minus_f_sq*(r-k*cos_zeta));
		var one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq = c;

		if (Math.abs(k) < EPSILON*p_dist_center) {
			return k;
		}

		var inside = one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq <= 0;

		var calc_tilde_phi = function(z_, tilde_t_, r_, k_) {
			var tilde_t_sq = tilde_t_*tilde_t_;
			return Math.atan2(z_*(1+tilde_t_sq)-2*k_*tilde_t_,
					one_minus_f_sq*(r_*(1+tilde_t_sq) - k_*(1-tilde_t_sq)));
		};

		var d;
		for (var iter = 0; iter < 100; iter++) {
			// paper Java differ on computing a and c. Java works
			a = one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq + one_minus_f_sq*(2*r + k)*k;
			b = -4*k*z/a;
			c = 2*(one_minus_f_sq_times_diff_r_sq_ae_sq_plus_z_sq + (1 + f*(2-f))*k*k)/a;
			d = b;

			// paper and Java differ here too. Again, Java works
			b += t;
			c += t*b;
			d += t*c;

			// find the other real root
			var Q = (3*c - b*b)/9,
				R = (b*(9*c - 2*b*b) - 27*d)/54;
			var D = Q*Q*Q + R*R;
			var tilde_t, tilde_phi;
			if (D >= 0) {
				var sqrt_D = Math.sqrt(D);
				tilde_t = cube_root(R + sqrt_D) + cube_root(R - sqrt_D) - b/3;
				tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
			} else {
				Q = -Q;
				var sqrt_Q = Math.sqrt(Q);
				var theta = Math.acos(R/(Q*sqrt_Q));
				tilde_t = 2*sqrt_Q*Math.cos(theta/3) - b/3;
				tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
				if (tilde_phi*phi < 0) {
					tilde_t = 2*sqrt_Q*Math.cos((theta + 2*Math.PI)/3) - b/3;
					tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
					if (tilde_phi*phi < 0) {
						tilde_t = 2*sqrt_Q*Math.cos((theta + 4*Math.PI)/3) - b/3;
						tilde_phi = calc_tilde_phi(z, tilde_t, r, k);
					}
				}
			}

			var delta_phi = Math.abs(tilde_phi - phi)/2;
			phi = Math.abs(tilde_phi + phi)/2;

			var cos_phi = Math.cos(phi), sin_phi = Math.sin(phi);
			var sin_phi_sq = sin_phi*sin_phi;
			var sqrt_stuff = Math.sqrt(1 - f*(2-f)*sin_phi_sq);
			if (delta_phi < EPSILON) {
				return r*cos_phi + z*sin_phi - ae*sqrt_stuff;
			}

			var delta_r = r - (ae*cos_phi)/sqrt_stuff,
				delta_z = z - (ae*one_minus_f_sq*sin_phi)/sqrt_stuff;
			k = Math.sqrt(delta_r*delta_r + delta_z*delta_z);
			if (inside) k = -k;
			t = delta_z/(delta_r + k);
		}

		// instead of emitting an error, return our best
		return r*cos_phi + z*sin_phi - ae*sqrt_stuff;
	}

	// TODO: object-ify our shapes
	function isNear(p, o) {
		
		if (o.con == "rect") {
			var farX = o.x+o.width, farY = o.y+o.height;
			var ul = {x: o.x, y: o.y}, ur = {x: farX, y:o.y},
				ll = {x: o.x, y: farY}, lr = {x: farX, y:farY};
			return _.any([[ul, ur], [ur, lr], [lr, ll], [ll, ul]], function (seg){
				return pointNearLineSegment(seg, p);
			});
		} else if (o.con == "ellipse") {
			return Math.abs(pointDistFromEllipse(p, o)) < CLOSE_ENOUGH;
		} else if (o.con == "path") {
			// convert list of points into pairs of points for line segments
			var line_segs = _.map(o.points, function (po, i){
				return [i?o.points[i-1] : _.last(o.points), po];
			});
			return _.any(line_segs, function (l){
				return pointNearLineSegment(l, p);
			});
		} else {
			throw "should not be reached";
		}
	}

	// TODO: make this take an object for options instead of a pile of
	// order-dependant args

	// initDrawMode should be one of the modes
	// overElm is the element that this VectorDrawer will be laid on top of
	// Note: the VectorDrawer will not move or resize if the element does

	/**
	 * Class: VectorDrawer
	 */
	/**
	 * Constructor: VectorDrawer
	 * Constructor for a new VectorDrawer
	 *
	 * Parameters:
	 * initDrawMode - {String} Initial draw mode. Should be one of 'r', 'p', 'e',
	 *   or 's' (for rectangle, polygon, ellipse, and select respectively).
	 *   Defaults to 's'.
	 * initScale - {Number} Initial scale of the image. Defaults to 1.
	 * initObjs - {Array} An initial set of objects (from VectorDrawer.savable). Defaults to []
	 * overElem - {jQuerySelector} The element to overlay with this VectorDrawer.
	 *   Can be a DOM element, string, etc. Defaults to "img" (the first image in the page)
	 */
	var VectorDrawer = Monomyth.Class.extend({
		init:function(initDrawMode, initScale, initObjs, startsize, overElm, auxClass) {
			var self = this;
			// only thing that methods access at the moment
			self._drawMode = initDrawMode || 's';
			self._scale = initScale || 1;
			self._allObjs = ((initObjs.shapes || initObjs)||[]);
			self._start = self._obj = self._points = null;
			self._auxClass = auxClass;
			self._tarObj = null;
			// XXX: should handle wandering out of the area...
			overElm = $(overElm || "img");
			
			//TILE VD CHANGES END
			// self._over = {
			// 				elm: $(overElm),
			// 				offset: overElm.offset(),
			// 				origWidth: overElm.width()/initScale,
			// 				origHeight: overElm.height()/initScale};
			// 			self._buildCanvas();
		},
		// VectorDrawer.prototype = {};
		// 		VectorDrawer.constructor = VectorDrawer;
		// 		jQuery.extend(VectorDrawer.prototype, {
		/**
		 * Method: drawMode
		 * Sets or gets the current drawMode. If no argument is given,
		 * returns the current drawMode.
		 *
		 * Parameters:
		 * drawMode - {String} the drawMode to set
		 */
		drawMode: function(newMode) {
			if (newMode != null) {
				if (self._obj) self._obj.cur.attr(INIT_ATTRS);
				this._drawMode = newMode;
			}
			return this._drawMode;
		},
		/**
		 * Method: scale
		 * Sets or gets the current scale. If no argument is given,
		 * returns the current scale. This will attempt to resize the element
		 * that this VectorDrawer overlays.
		 *
		 * Parameters:
		 * scale - {Number} the scale to set
		 */
		scale: function(newScale) {
			var self = this;
			if (newScale == null || newScale < 0) {
				return self._scale;
			}
			self._scale = newScale;
			var newSize = {
				width: self._over.origWidth*self._scale,
				height: self._over.origHeight*self._scale
			};
			self._over.elm.css(newSize);
			_.each(self._allObjs, function (o) {
				o.cur.remove();
				o.cur = null;
			});
			self._canvas.elm.remove();
			this._buildCanvas();
			return self._scale;
		},
		/**
		 * Method: savable
		 * Returns an array representing all the shapes/objects currently drawn
		 * by this VectorDrawer. These should not be fiddled with if you plan
		 * to pass them to the constructor as its initObjs argument.
		 */
		savable: function() {
			return _.map(this._allObjs, function(o){
				var r = {};
				_.each(["scale", "con", "args", "x", "y", "width", "height",
					"points", "cx", "cy", "rx", "ry", "auxData"],
					function (p) {if (p in o) {
						
						r[p] = o[p];
						debug("saving: "+p+" "+r[p]);
					}
					});
				return r;
			});
		},
		// _buildCanvas: function() {
		// 			var self = this;
		// 			self._cont = self._cont || $("<div class=\"vd-container\"></div>").appendTo("body");
		// 			self._cont.css({left: self._over.offset.left, top: self._over.offset.top, position: "absolute"});
		// 			self._paper = R(self._cont[0],
		// 				self._over.elm.width(), self._over.elm.height());
		// 			self._canvas = {elm:$(self._paper.canvas)};
		// 			self._canvas.off = self._canvas.elm.offset();
		// 			self._over.offset = self._over.elm.offset();
		// 			self._installHandlers();
		// 			_.each(self._allObjs, function (o) {
		//                 if (self._paper[o.con]){
		// 					o.cur = self._paper[o.con].apply(self._paper, o.args);
		// 					var rs = relScale(self, o);
		// 					o.cur.scale(rs, rs, 0, 0);
		// 					o.cur.attr(INIT_ATTRS);
		//               	}
		// 			});
		// 		},
		// given an event e, figure out where it is relative to the canvas
		_getCanvasXY: function (e) {
			var self = this;
			return {
				x: e.clientX-self._canvas.off.left,
				y: e.clientY-self._canvas.off.top
			};
		},
		_installHandlers: function() {
			
			var self = this;

			self._cont.mouseover(function(e){
				
				}).mousedown(function(e) {
				if (1 != e.which) return;
				e.preventDefault();

				var cur = self._getCanvasXY(e);
				if (self._drawMode == 'r') {
					self._start = cur;
					self._obj = self._paper.rect(self._start.x, self._start.y, 0, 0);
					self._obj.attr(INIT_ATTRS);
				} else if (self._drawMode == 'e') {
					self._start = cur;
					self._obj = self._paper.ellipse(self._start.x, self._start.y, 0, 0);
					self._obj.attr(INIT_ATTRS);
				} else if (self._drawMode == 'p') {
					if (self._points) {
						var f = _.first(self._points);
						var a = cur.x - f.x,
							b = cur.y - f.y;
						var maybeClosing = false;
						if (Math.sqrt(a*a + b*b) < CLOSE_ENOUGH) {
							maybeClosing = true;
						}
						if (self._points.length > 2) {
							// if we're closing the polygon,
							// then we skip the first line
							var inter = false,
								ps = self._points.slice(maybeClosing? 2:1, -2),
								lp = self._points[maybeClosing? 1 : 0],
								pcur = self._points[self._points.length-2];
							_.each(ps, function(cp) {
								if (lineSegsIntersect(lp, cp, pcur, cur)) {
									inter = true;
									_.breakLoop();
								}
								lp = cp;
							});
							// intersection detected, don't use this
							if (inter) return;
						}
						if (maybeClosing) {
							self._points.pop();
							var path = makePathStr(self._points) + " z";
							self._obj.attr({"path": path});
							var bbox = self._obj.getBBox();
							if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) {

								self._allObjs.push({
									cur: self._obj,
									con: "path",
									args: [path],
									points: self._points,
									scale: self._scale
								});
							}
							self._obj = self._points = null;
							return; // done!
						}
					} else {
						self._points = [cur];
						self._obj = self._paper.path(makePathStr(self._points));
						self._obj.attr(INIT_ATTRS);
					}
					self._points.push({x: cur.x, y: cur.y});
				} else if (self._drawMode == 's') {
					if (!(e.target.id == "selBB")) {
						if (self._obj) {
							self._obj.cur.attr(INIT_ATTRS);
							if (self._auxClass && self._obj.curAux) {
								self._obj.auxData = self._obj.curAux.close();
								
								delete self._obj.curAux;
							}
						}
						self._obj = null;
						
						targetObj = _.first(_.select(self._allObjs, function(o){
						
						
							return isNear(cur, o);
						}));
						if (!targetObj) {
							//$("#selBB").remove();
							return;
						}
						
						targetObj.cur.attr(SELECTED_ATTRS);
						if (self._auxClass && !targetObj.curAux) {
							targetObj.curAux = new self._auxClass(targetObj.auxData, {
								x: e.clientX,
								y: e.clientY
							});
						}
						
						self._obj = targetObj;
						self._start = cur;
						
						// Create bounding box
						
						var bb = targetObj.cur.getBBox();
						zH = $(".zotero").height();
						debug("zotH  " + zH);
						var bbH = parseInt(bb.height,10);
						var bbW = parseInt(bb.width,10);
						var bbL = bb.x;
						var bbT = parseInt(bb.y,10) + parseInt(zH,10);
						
						vd = $(".vd-container")[0];
						
						if (!($("#selBB").offset())) {
							$(vd).append("<div id='selBB'></div>");
						}
						$("#selBB").css({
							"height": bbH,
							"width": bbW,
							"border": "thick cyan solid"
						
						});
						$("#selBB").offset({
							left: bbL,
							top: bbT
						});
						debug("BEFORE RESIZE: "+targetObj);
						if (self._obj){
							self._tarObj = self._obj;
						}
						$("#selBB").draggable({
							
							stop: function(e, ui){
								tobj = self._tarObj;
								debug("XXXXXXXXXXXXXX");
								for (n in tobj){
									debug(n+":"+tobj[n]);
								}
								debug("tobj: "+tobj);
								if(tobj.con == "rect") {
									tobj.cur.attr({
										x: ui.offset.left,
										y: ui.offset.top - zH
									});
									tobj.x = ui.offset.left;
									tobj.y = ui.offset.top - zH;
									tobj.args = [ui.offset.left, ui.offset.top - zH, $("#selBB").width(), $("#selBB").height()];
								}
								else 
									if (tobj.con == "ellipse") {
									
									
										newCX = ui.offset.left + ($("#selBB").width() / 2);
										newCY = ui.offset.top + ($("#selBB").height() / 2) - zH;
										tobj.cur.attr({
											cx: newCX,
											cy: newCY
										});
										tobj.cx = newCX;
										tobj.cy = newCY;
										tobj.args = [newCX, newCY, $("#selBB").width() / 2, $("#selBB").height() / 2];
									}
								
								
							}
						});
						
					
						$("#selBB").resizable({
							
							stop: function(e, ui){
								tobj = self._tarObj;
								if (tobj.con == "rect") {
									
									debug(ui.size.width + "_width");
									tobj.cur.attr({
										width: ui.size.width,
										height: ui.size.height
									});
									tobj.width = ui.size.width;
									tobj.height = ui.size.height;
									tobj.con = "rect";
									tobj.args = [tobj.x, tobj.y, ui.size.width, ui.size.height];
								}
								else 
									if (tobj.con == "ellipse") {
									    
										tobj.cur.attr({
											ry: ui.size.height / 2,
											rx: ui.size.width / 2
										});
										tobj.args = [tobj.x, tobj.y, ui.size.width / 2, ui.size.height / 2];
									}
								
							}
						});
						
						self._obj = targetObj;
						self._start = cur;
					}
					
				} else {
					_installHandlers;
					throw "should not be reached";
				}
			}).mouseup(function (e) {
				if (1 != e.which) return;
				e.preventDefault();

				if (self._drawMode == 'r' || self._drawMode == 'e') {
					if (!self._obj) return;
					var metaObj = {
						cur: self._obj,
						scale: self._scale
					};
					
					if (self._drawMode == 'r') {
						var as = self._obj.attr(["x", "y", "width", "height"]);
						
						$.extend(metaObj, {
							con: "rect",
							args: [as.x, as.y, as.width, as.height],
							x: as.x,
							y: as.y,
							width: as.width,
							height: as.height
						});
						
					} else if (self._drawMode == 'e') {
						var as = self._obj.attr(["cx", "cy", "rx", "ry"]);
						$.extend(metaObj, {
							con: "ellipse",
							args: [as.cx, as.cy, as.rx, as.ry],
							cx: as.cx,
							cy: as.cy,
							rx: as.rx,
							ry: as.ry
						});
					} else {
						
						throw "should not be reached ";
					}
					var bbox = metaObj.cur.getBBox();
					if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) self._allObjs.push(metaObj);
					self._start = self._obj = null;
				} else if (self._drawMode == 'p') {
					// do nothing
				} else if (self._drawMode == 's') {
					self._start = null; // stop moving
					var o = self._obj;
					if (o && targetObj) {
						_.each(["scale", "con", "args", "x", "y", "width", "height",
							"points", "cx", "cy", "rx", "ry"],function(p){
								if (p in o) {
									debug("mouseup "+p+":"+targetObj[p]);
									o[p] = targetObj[p];
								}
							});
					}
				} else {
					throw "should not be reached";
				}
			}).mousemove(function (e) {
				
				if (!self._obj) return;
				e.preventDefault();

				var cur = self._getCanvasXY(e);
				if (self._drawMode == 'r' || self._drawMode == 'e') {
					if (!self._obj) return;

					var tl = {x: _.min([cur.x, self._start.x]), y: _.min([cur.y, self._start.y])},
					br = {x: _.max([cur.x, self._start.x]), y: _.max([cur.y, self._start.y])},
					halfWidth = (br.x-tl.x)/2,
					halfHeight = (br.y-tl.y)/2;

					if (self._drawMode == 'r') {
						self._obj.attr({
							x: tl.x, y: tl.y,
							width: br.x - tl.x,
							height: br.y - tl.y
						});
					} else if (self._drawMode == 'e') {
						self._obj.attr({
							cx: tl.x + halfWidth,
							cy: tl.y + halfHeight,
							rx: halfWidth,
							ry: halfHeight
						});
					} else {
						throw "should not be reached";
					}
				} else if (self._drawMode == 'p') {
					if (!self._points) return;

					var lp = _.last(self._points);
					lp.x = cur.x;
					lp.y = cur.y;
					self._obj.attr({"path": makePathStr(self._points)});
				} else if (self._drawMode == 's') {
					/*
					if (!self._start || !self._obj) return;

					var st = self._start;
					var o = self._obj;
					var rs = relScale(self, o);
					//var shift = {x: (cur.x-st.x)/rs, y: (cur.y-st.y)/rs};
					//o.newO = shiftShape(o, shift);
					if (o.con == "rect") {
					//	o.cur.attr({x: o.newO.x*rs, y: o.newO.y*rs*rs});
				
						
						
						
					} else if (self._obj.con == "ellipse") {
						//o.cur.attr({cx: o.newO.cx*rs, cy: o.newO.cy*rs});
					} else if (self._obj.con == "path") {
						o.cur.attr({path: makePathStr(_.each(o.newO.points, function(p){
							return {x: p.x*rs, y: p.y*rs};
						})) + " z"});
					} else {
					
						throw "should not be reached";
					}
					*/
					
				} else {
					alert("double ouch");
			
					throw "should not be reached";
				}
			});
			// doesn't figure out if our canvas has focus
			// having multiple ops (in different canvases) seems pretty FUBAR, tho
			$(document).keydown(function(e) {
				// we use this to avoid acting on the same event repeatedly
				var PREV_VAL = 1132423;
				if (e.result == PREV_VAL) return PREV_VAL;

				// if it's escape, stop what we're doing
				if (e.keyCode === 27) {
					if (self._obj) self._obj.remove();
					self._start = self._obj = self._points = null;
				} else if ((e.keyCode === 46 || e.keyCode === 8)
						  && self._drawMode == 's') {
					// delete or backspace
					e.preventDefault();
					if (!self._obj) return 1132423;
					var o = self._obj;
					if (o && confirm("You are about to delete annotation. Is that okay?")) {
						self._allObjs = _.reject(self._allObjs, function (c){return c == o;});
						o.cur.remove();
						self._start = self._obj = self._points = null;
					}
				}
				return 1132423;
			});
		}
	});

	rootNS.VectorDrawer = VectorDrawer;
	//TILE VECTORDRAWER PLUGIN
	//grantd 
	var tile_vd=VectorDrawer.extend({
				init:function(initDrawMode,initScale,initObjs,startsize,overElm,auxClass,auxContainer){
					this.$super(initDrawMode,initScale,initObjs,startsize,overElm,auxClass);
					var self=this;
					
					if(auxContainer){
						this._auxContainer=$("#"+auxContainer);
						
					}
					//TILE VD CHANGES
					//NEW: for responding to destroy shape trigger
					 $("body").bind("VD_REMOVESHAPE",{obj:this},self.destroySingleShape);
					//global bind for TILE to change color 
					$("body").bind("NEWSHAPECOLOR",{obj:this},self.changeINIT_ATTRColor);
					//global bind for changing shape's display (or show all mode)
					$("body").bind("shapeDisplayChange",{obj:this},self.displayObjControl);
					//global bind for turning off raphael canvas when the colorpicker is toggled
					$("body").bind("closeDownVD",{obj:this},self.setState);
					//global bind for cutting off height/width from canvas
					$("body").bind("pullUpCanvas",{obj:this},self.pullUp);
			         //global listener for the none/current/all shape viewing
					$("body").bind("shapeSelect",{obj:this},self.OverDisplayControl);
					//global listener for changing which shape is being drawn
					$("body").bind("changeShapeType",{obj:this},self.drawMode);
					
					//global listener
					$("body").bind("stopDrawing",{obj:this},function(e){
						var self=e.data.obj;
						self._drawMode='s';
					});
					self._manifest=[];
					self._INIT_ATTRS=INIT_ATTRS;
					self._over = {
			             elm: $(overElm),
			             offset: {left:0,top:0},
			             origWidth: startsize[0]*initScale,
			             origHeight: startsize[1]*initScale,
					 	 startWidth:startsize[0],
						 startHeight:startsize[1]
					};
			        self._buildCanvas(null,null);
					//call other bound elements that we are done
					self._over.elm.trigger("VDCanvasDONE",[self._canvas.elm]);
			},
			//overwriting drawMode function
			drawMode:function(e,newMode){
				var self=e.data.obj;
				if (newMode != null) {
					if (self._obj) self._obj.cur.attr(INIT_ATTRS);
					self._drawMode = newMode;
				}
				return self._drawMode;
			},
			//overwriting scale function
			//NEW: controls the zoom level of the current image object
	         scale: function(newScale) {
	             var self = this;
	             if (newScale == null || newScale < 0) {
	                 return self._scale;
	             }

	             self._scale = newScale;

				//NEW: added startWidth and startHeight as modifiers to scaling method
	             var newSize = {
	                 width: self._over.startWidth*self._scale,
	                 height: self._over.startHeight*self._scale
	             };
				self._over.elm.css(newSize);
				//NEW: ONLY FOR TILE INTERFACE
				//correcting the <SVG> and <SCROLLER> overlap problem - <SVG> swallows all mouse events
			//	if(newSize.height>$("#scroller").position().top) newSize.height=($("#scroller").position().top-self._over.elm.offset().top-5);

	             _.each(self._allObjs, function (o) {
	                 o.cur.remove();
	                 o.cur = null;
	             });
	             self._canvas.elm.remove();

				 //NEW: feeding buildCanvas w/h vars to force resizing
				//setTimeout to make sure that the src is loaded by the time the raphael canvas is made
				setTimeout(function(obj,w,h){
					obj._buildCanvas(w,h);
				},1,this,newSize.width,newSize.height);
	             // this._buildCanvas(newSize.width,newSize.height);

	             return self._scale;
	         },	
			 //merging the functions below with the tile_vd plugin
			 changeINIT_ATTRColor:function(e,hex){
				var self=e.data.obj;
				self._INIT_ATTRS.stroke="#"+hex;
			 },	
			 displayObjControl:function(e,mode,id){
				var self=e.data.obj;
				//a: activate
				//d: deactivate
				//sa: setAnchor
				//ra: releaseAnchor
				//get Shape
				if(self._displayingMode=='c'){
					
					var S=jQuery.grep(self._allObjs,function(val,i){
						return (val.id==id);
					});
					S=S[0];
					if(S){
						switch(mode){
							case 'a':
								S.activate();
								break;
							case 'd':
								S.deactivate();
								self.drawMode('s');
								break;
							case 'sa':
								S.setAnchor();
								break;
							case 'ra':
								S.releaseAnchor();
								break;
						}
					}
				}
				
			 },
			OverDisplayControl:function(e,m){
				//m is the mode passed by calling object
				//@m: ['all','none','current']
				var self=e.data.obj;
				switch(m){
					case 'all':
						//show all shapes regardless of current active one
						//go through manifest to find all shapes
						self._displayingMode='a';
						var p=self._allObjs;
						for(sh in p){
							p[sh].activate();
							p[sh].setAnchor();
						}
						
						break;
					case 'current':
						//default
						//go through current shape manifest and release all possible anchors
						self._displayingMode='c';
						var p=self._allObjs;
						
						for(sh in p){
							if(p[sh].anchor){
								p[sh].deactivate();
								p[sh].releaseAnchor();
								
							}
						}
						break;
					case 'none':
						//hide all shapes
						self._displayingMode='n'; //display mode set
						var p=self._allObjs;
						for(sh in p){
							if(p[sh].anchor){
								p[sh].deactivate();
							}
						}
						break;
				}
			},
			//triggered whenever closeDownVD is triggered 
			//can also reopen the canvas
			setState:function(e,state){
				var obj=e.data.obj;
				if(state){
					//colorpicker is open
					//set canvas to 0,0
					 //NEW:set point-event property to none for canvas
					obj._canvas.elm.css('pointer-events','none');
				} else {
					//set pointer-events property back to visible (default?)
					obj._canvas.elm.css('pointer-events','visible');
					
				}
			},
			pullUp:function(e,dw,dh){
				var obj=e.data.obj;
				
				//dw {int} is distance to cut off right side of canvas-img area
				//dh {int} is distance to cut off bottom of canvas-img area
				if((dw>0)|(dh>0)) {
					obj._canvas.elm.hide();
				} else {
					obj._canvas.elm.show();
				}
				obj._over.elm.css({width: ((obj._over.startWidth*obj._scale)-dw),height: ((obj._over.startHeight*obj._scale)-dh)});
				
			},
			
			//NEW: outputs the contents of the manifest file
			masterObjList:function(){
				//returns array with {uri}:{Object}
				return _.map(this._manifest, function(o,i){
	                 var r = {};
	                 _.each(["scale", "con", "args", "x", "y", "width", "height",
	                     "points", "cx", "cy", "rx", "ry"],
	                     function (p) {if (p in o) r[p] = o[p];});
	                 return {i:r};
	             });
			},
			//NEW: taking list from output of masterObjList and loading in all shapes 
			//related to that list
			loadMasterObjList:function(list){
				// @list format is in JSON
				for(l in list){
					
					for(sh in list[l]){
						var o=list[l][sh];
						if(!this._manifest[o.uri.replace(/^[ \t\r\n]+|[ \t\r\n]+$/,"")]) this._manifest[o.uri.replace(/^[ \t\r\n]+|[ \t\r\n]+$/,"")]=[];
						var args=null;
						
						switch(o.type){
							case 'rect':
								args=[o.points.x,o.points.y,o.points.width,o.points.height];
								o.x=o.points.x;
								o.y=o.points.y;
								o.width=o.points.width;
								o.height=o.points.height;
								break;
							case 'ellipse':
								args=[o.points.cx,o.points.cy,o.points.rx,o.points.ry];
								o.cx=o.points.cx;
								o.cy=o.points.cy;
								o.rx=o.points.rx;
								o.ry=o.points.ry;
								break;
							case 'path':
								var _P=[];
								$.each(o.points.points,function(i,a){
									_P.push({x:a.x,y:a.y});
								});
								args=[makePathStr(_P)+" z"];
								//args=[o.points.points];
							
								break;
						}
						//set up other properties
						
						o.con=o.type;
						o.color=o.points.color;
						$.extend(o,{
							cur:null,
							scale:o.points.scale,
							id:o.uid,
							args:args,
							shapeChangeCall:"shapeCoordUpdate"+o.uid,
							anchor:false,
							_display:false,
							deactivate:function(){
								this.cur.hide();
								this._display=false;
							},
							activate:function(){
								this.cur.show();
								this._display=true;
							},
							setAnchor:function(){
								this.anchor=true;
							},
							releaseAnchor:function(){
								this.anchor=false;
							}
						});
						this._manifest[o.uri.replace(/^[ \t\r\n]+|[ \t\r\n]+$/,"")].push(o);
					}
				}
			
				if(this._manifest[this._over.elm.attr("src")]) this._allObjs=this._manifest[this._over.elm.attr("src")];
				
				this._canvas.elm.remove();
				this._buildCanvas(null,null);
			},
			outputAllCoords:function(e){
				var self=e.data.obj;
				for(url in self._manifest){
					for(sh in self._manifest[url]){
						var shape=self._manifest[url][sh];
						
					}
				}
			},
			//NEW: shape has been deleted, respond to trigger
			destroySingleShape:function(e,id){
				var self=e.data.obj;
				var NSHAPE="";
				//check if _obj or _start are this shape
				if(self._start&&(self._start.id==id)){
					self._start=null;
				}
				if(self._obj&&($.data($(self._obj.node),"uid")==id)){
					self._obj=null;
				}
				
				//find the id in _allObjs and remove it
				self._allObjs=jQuery.grep(self._allObjs,function(val,i){
					
					if(val.id==id){
						
						//clear shape from screen
						val.cur.remove();
						val.cur=null;
						NSHAPE=val.con;
						//clear from allObjs
						return false;
					} else {
						return true;
					}
				});
				//adjust the main _manifest file
				if(self._manifest[self._over.elm.attr("src")]){
					self._manifest[self._over.elm.attr("src")]=self._allObjs;
				}
				switch(NSHAPE){
					case 'rect':
						self._drawMode="r";
						break;
					case 'path':
						self._drawMode="p";
						break;
					case 'ellipse':
						self._drawMode="e";
						break;
				}
			},
			//NEW: send off a single shape - added grantd
			sendSingleShape:function(obj){
				var self=this;
				if(obj.con=="poly"){
					$.extend(obj,{
						displayArgs:makePathStr(obj._points)
					});
				}
				debug('shape object to be sent: '+obj);
				$(self._canvas.elm).trigger("shapeCommit",[obj]);
				//selecting
				self._drawMode="s";
			},
			//NEW: changing the origWidth/height values and other variables
			//restarting the buildCanvas
			changeOverElm:function(args){
				var self=this;
				
				_.each(self._allObjs, function (o) {
	                o.deactivate();//sets display to false 
					o.cur.remove();
	                 o.cur = null;
	             });
				if(!self._manifest[self._over.elm.attr("src")]) self._manifest[self._over.elm.attr]=[];
				self._manifest[self._over.elm.attr("src")]=self._allObjs;
				self._allObjs=[];
				self._canvas.elm.remove();
				self._over.elm.attr("src",args.url);
				//in case img has self-width/height
				self._over.elm.css({width:"",height:""});
				//resize
				if(args.startsize){
					self._over.origWidth=(self._over.elm[0].width*self._scale);
					self._over.origHeight=(self._over.elm[0].height*self._scale);
					self._over.startWidth=self._over.elm[0].width;
					self._over.startHeight=self._over.elm[0].height;
				}
				self.scale(self._scale);
			},
			//@w,h: null - canvas set to origWidth & origHeight, int - canvas set to these sizes
			//Calls trigger event VDCanvasDONE when done
	         _buildCanvas: function(w,h) {
	             var self = this;
				//NEW: forcing the resizing of the canvas to fit the image frame
				//using two additional variables: w, h
				//if(self._auxContainer) self._over.offset={left:0,top:0}; //adjusting in case the canvas is in another container - besides body
				 if((w==null)||(h==null)){
					
	         		self._paper = R(self._over.offset.left, self._over.offset.top,self._over.origWidth,self._over.origHeight);
	
		
				 } else {
					self._paper = R(self._over.offset.left, self._over.offset.top,w,h);
			 	 }
			
	             self._canvas = {elm:$(self._paper.canvas)};
				if(self._auxContainer) {
					self._canvas.elm.remove().appendTo(self._auxContainer);
					
				}
	            self._canvas.off = self._canvas.elm.offset();
	            self._over.offset = (self._auxContainer)?{left:0,top:0}:self._over.elm.offset();
	            self._installOneShotHandlers();
	
				if(self._manifest[self._over.elm.attr("src")]){
					self._allObjs=self._manifest[self._over.elm.attr("src")];
				} else {
					self._manifest[self._over.elm.attr("src")]=[];
				}
				
	            _.each(self._allObjs, function (o) {
	                 o.cur = self._paper[o.con].apply(self._paper,(typeof o.args=="string")?[o.args]:o.args);
	                 var rs = relScale(self, o);
	                 o.cur.scale(rs, rs, 0, 0);
					if(o.color) o.cur.attr({stroke:o.color});
					if((!o._display)&&(self._displayingMode!='a')){
					 	o.cur.hide();
					 }
	             });
				//update manifest for this page
				self._manifest[self._over.elm.attr("src")]=self._allObjs;
				
				
	         },
			//added by GrantD - turns off handlers once a shape is drawn - specific to TILE
			_uninstallHandlers:function(){
				var self=this;
				self._canvas.elm.mousedown(function(e){}).mouseup(function(e){}).mousemove(function(e){});
				self._canvas.elm.unbind();
			},
			//Clears all the shapes on the current manifest URL
			_reset_CurrUrl:function(){
				var self=this;
				if(self._manifest[self._over.elm.attr("src")]){
					var os=self._manifest[self._over.elm.attr("src")];
					for(x in os){
						var sh=os[x]; //shape object
						if(sh.cur) sh.cur.remove();
						sh=null;
					}
					self._manifest[self._over.elm.attr("src")]=[]; //reset the current manifest
				}
			},	
			_reset_All:function(){
				var self=this;
				for(url in self._manifest){
					var cm=self._manifest[url];
					for(x in cm){
						var sh=cm[x]; //shape object
						if(sh.cur)	sh.cur.remove();
						sh=null;
					}
					//erase the manifest 
					cm=[];
				}
			},
			//NEW: removes canvas elements and gets rid of VectorDrawer
			_end:function(){
				var self=this;
				self._canvas.elm.remove();
				self._over.elm.remove();
			},
			//NEW: same code as _installHandlers
			//In this case, after a shape is drawn, it is sent to sendSingleShape and the listeners
			//are turned off (no more drawing shapes until parent object calls _installOneShotHandlers again)
			_installOneShotHandlers:function(){
				var self = this;
	             self._canvas.elm.mousedown(function(e) {
	                 if (1 != e.which) return;
	                 e.preventDefault();
						debug("mousedown  "+self._drawMode);
	                 var cur = self._getCanvasXY(e);
	                 if (self._drawMode == 'r') {
					
	                     self._start = cur;
	                     self._obj = self._paper.rect(self._start.x, self._start.y, 0, 0);
							var randD=new Date(); 
							var id=randD.getTime()+"_"+self._allObjs.length;
							$.data(self._obj.node,'uid',id);
	                     self._obj.attr(self._INIT_ATTRS);
						 
	                 } else if (self._drawMode == 'e') {
	                     self._start = cur;
	                     self._obj = self._paper.ellipse(self._start.x, self._start.y, 0, 0);
							var randD=new Date(); 
							var id=randD.getTime()+"_"+self._allObjs.length;
							$.data(self._obj.node,'uid',id);
	                     self._obj.attr(self._INIT_ATTRS);
	                 } else if (self._drawMode == 'p') {
	                     if (self._points) {
	                         var f = _.first(self._points);
	                         var a = cur.x - f.x,
	                             b = cur.y - f.y;
	                         var maybeClosing = false;
	                         if (Math.sqrt(a*a + b*b) < CLOSE_ENOUGH) {
	                             maybeClosing = true;
	                         }
	                         if (self._points.length > 2) {
	                             // if we're closing the polygon,
	                             // then we skip the first line
	                             var inter = false,
	                                 ps = self._points.slice(maybeClosing? 2:1, -2),
	                                 lp = self._points[maybeClosing? 1 : 0],
	                                 pcur = self._points[self._points.length-2];
	                             _.each(ps, function(cp) {
	                                 if (lineSegsIntersect(lp, cp, pcur, cur)) {
	                                     inter = true;
	                                     _.breakLoop();
	                                 }
	                                 lp = cp;
	                             });
	                             // intersection detected, don't use this
	                             if (inter) return;
	                         }
	                         if (maybeClosing) {
	                             self._points.pop();
	                             var path = makePathStr(self._points) + " z";
	                             self._obj.attr({"path": path});
	                             var bbox = self._obj.getBBox();
	                             if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) {
									//shape complete - update shape array and send to 
									//TILE tag
	                         		var randD=new Date(); 
									var id=randD.getTime()+"_"+self._allObjs.length;
	                                self._allObjs.push({
										id:id,
										shapeChangeCall:"shapeCoordUpdate"+id,
										cur: self._obj,
										color:self._INIT_ATTRS.stroke,
										anchor:false,
										_display:true,
										deactivate:function(cur){
											this.cur.hide();
											this._display=false;
										},
										activate:function(cur){
											this.cur.show();
											this._display=true;
										},
										setAnchor:function(){
											this.anchor=true;
										},
										releaseAnchor:function(){
											this.anchor=false;
										},
										con: "path",
										args: [path],
										points: self._points,
										scale: self._scale
									});
									self.sendSingleShape(self._allObjs[(self._allObjs.length-1)]);
	                             }
	                             self._obj = self._points = null;
	                             return; // done!
	                         }
	                     } else {
	                         self._points = [cur];
	                         self._obj = self._paper.path(makePathStr(self._points));
	                         self._obj.attr(self._INIT_ATTRS);
	                     }
	                     self._points.push({x: cur.x, y: cur.y});
	                 } else if (self._drawMode == 's') {
						//PRE-NEO version of selecting shapes:
	                     // if (self._obj) self._obj.cur.attr(self._INIT_ATTRS);
	                     // 	                     self._obj = null;
	                     // 	                     var targetObj = _.first(_.select(self._allObjs,
	                     // 	                         function(o){
	                     // 	                             return isNear(cur, o);
	                     // 	                         }));
	                     // 	                     if (!targetObj) return;
	                     // 						
	                     // 						 if(targetObj.anchor) return;
	                     // 	                     targetObj.cur.attr(SELECTED_ATTRS);
	                     // 	                     self._obj = targetObj;
	                     // 	                     self._start = cur;
						//NEW METHOD for selecting shapes:
						if (!(e.target.id == "selBB")) {
							if (self._obj) {
								self._obj.cur.attr(INIT_ATTRS);
								if (self._auxClass && self._obj.curAux) {
									self._obj.auxData = self._obj.curAux.close();

									delete self._obj.curAux;
								}
							}
							self._obj = null;

							targetObj = _.first(_.select(self._allObjs, function(o){


								return isNear(cur, o);
							}));
							if (!targetObj) {
								$("#selBB").hide();
								return;
							}

						//	targetObj.cur.attr(SELECTED_ATTRS);
							// if (self._auxClass && !targetObj.curAux) {
							// 								targetObj.curAux = new self._auxClass(targetObj.auxData, {
							// 									x: e.clientX,
							// 									y: e.clientY
							// 								});
							// 							}

							self._obj = targetObj;
							self._start = cur;

							// Create bounding box

							var bb = targetObj.cur.getBBox();
						//	zH = $(".zotero").height();
						//	debug("zotH  " + zH);
						//FOR TILE: container of entire canvas is the raphael div - id: raphael
						vd = $("#raphael");
							var bbH = parseInt(bb.height,10);
							var bbW = parseInt(bb.width,10);
							var bbL = bb.x+vd.offset().left;
							var bbT = parseInt(bb.y,10);
							
							if (!($("#selBB").html())) {
								vd.append("<div id='selBB'><span id='selBB_handle'>Move</span></div>");
							} else {
								$("#selBB").show();
							}
							$("#selBB").css({
								"height": bbH,
								"width": bbW,
								"left":bbL,
								"top":bbT,
								"border": "thick cyan solid",
								"position":"absolute"
							});
							$("#selBB_handle").css({
								"height":(bbH/4),
								"width":(bbW/4),
								"background-color":"red"
							});
							if (self._obj){
								self._tarObj = self._obj;
							}
							//specify the "MOVE" span as the handle - otherwise can't seem to drag element
							$("#selBB").draggable({
								handle:'#selBB_handle',
								stop: function(e, ui){
									tobj = self._tarObj;
									for (n in tobj){
										debug(n+":"+tobj[n]);
									}
									debug("tobj: "+tobj);
									if(tobj.con == "rect") {
										tobj.cur.attr({
											x: ui.offset.left,
											y: ui.offset.top
										});
										tobj.x = ui.offset.left;
										tobj.y = ui.offset.top;
										tobj.args = [ui.offset.left, ui.offset.top, $("#selBB").width(), $("#selBB").height()];
									}
									else 
										if (tobj.con == "ellipse") {


											newCX = ui.offset.left + ($("#selBB").width() / 2);
											newCY = ui.offset.top + ($("#selBB").height() / 2);
											tobj.cur.attr({
												cx: newCX,
												cy: newCY
											});
											tobj.cx = newCX;
											tobj.cy = newCY;
											tobj.args = [newCX, newCY, $("#selBB").width() / 2, $("#selBB").height() / 2];
										}


								}
							});
							$("#selBB").resizable({

								stop: function(e, ui){
									tobj = self._tarObj;
									if (tobj.con == "rect") {

										debug(ui.size.width + "_width");
										tobj.cur.attr({
											width: ui.size.width,
											height: ui.size.height
										});
										tobj.width = ui.size.width;
										tobj.height = ui.size.height;
										tobj.con = "rect";
										tobj.args = [tobj.x, tobj.y, ui.size.width, ui.size.height];
									}
									else 
										if (tobj.con == "ellipse") {

											tobj.cur.attr({
												ry: ui.size.height / 2,
												rx: ui.size.width / 2
											});
											tobj.args = [tobj.x, tobj.y, ui.size.width / 2, ui.size.height / 2];
										}
								}
							});

							self._obj = targetObj;
							self._start = cur;
						}
	                 } else {
	                     throw "should not be reached";
	                 }
	             }).mouseup(function (e) {
		//At mouseup, that's when the user has finished drawing a shape (Click and Drag and Done)
	                 if (1 != e.which) return;
	                 e.preventDefault();
	
	                 if (self._drawMode == 'r' || self._drawMode == 'e') {
	                     if (!self._obj) return;
						 //NEW: adding elements to the MetaObj:
						 /**
						 *@anchor: {Bool} controls whether shape is moved or not
						*@deactivate: {Function}  hides shape
						*@setAnchor: {Function}
						*@releaseAnchor: {Function}
						*@activate:
						
						 **/
	                     var metaObj = {
	                         cur: self._obj,
	                         scale: self._scale,
							 color:self._INIT_ATTRS.stroke,
							 _display:true, 
							anchor:false,
							 deactivate:function(){
								if(this.cur){
							 		this.cur.hide();
									this._display=false;
								}
							 },
							activate:function(){
								this.cur.show();
								this._display=true;
								
							},
							setAnchor:function(){
								this.anchor=true;
							},
							releaseAnchor:function(){
								this.anchor=false;
							}
	                     };
						
	                     if (self._drawMode == 'r') {
	                         var as = self._obj.attr(["x", "y", "width", "height"]);
							 var id=$.data(self._obj.node,"uid");
	                         $.extend(metaObj, {
								 id:id,
								 shapeChangeCall:"shapeCoordUpdate"+id,
	                             con: "rect",
	                             args: [as.x, as.y, as.width, as.height],
	                             x: as.x,
	                             y: as.y,
	                             width: as.width,
	                             height: as.height
	                         });
							 
							 self.sendSingleShape(metaObj);
							//self._uninstallHandlers();
	                     } else if (self._drawMode == 'e') {
	                         var as = self._obj.attr(["cx", "cy", "rx", "ry"]);
							 var id=$.data(self._obj.node,"uid");
	                         $.extend(metaObj, {
								 id:id,
								 shapeChangeCall:"shapeCoordUpdate"+id,
	                             con: "ellipse",
	                             args: [as.cx, as.cy, as.rx, as.ry],
	                             cx: as.cx,
	                             cy: as.cy,
	                             rx: as.rx,
	                             ry: as.ry
	                         });
							self.sendSingleShape(metaObj);
							//self._uninstallHandlers();
	                     } else {
	                         throw "should not be reached";
	                     }
	                     var bbox = metaObj.cur.getBBox();
	                     if (bbox.width > TOO_SMALL && bbox.height > TOO_SMALL) self._allObjs.push(metaObj);
	                     self._start = self._obj = null;
	                 } else if (self._drawMode == 'p') {
	                     // do nothing
	                 } else if (self._drawMode == 's') {
	                     self._start = null; // stop moving
	                     var o = self._obj;
						 if (o && o.newO) {
							//replace the older values with the new ones
	                         _.each(["scale", "con", "args", "x", "y", "width", "height",
	                             "points", "cx", "cy", "rx", "ry"],
	                             function (p) {if (p in o){ 
									o[p] = o.newO[p];
									// if($("#selBB")){
									// 										var c=(p=="cx"|p=="x")?"left":(p=="y"|p=="cy")?"top":null;
									// 										if(c) $("#selBB").css({p:o});
									// 									}
								}});
								self._canvas.elm.trigger(o.shapeChangeCall,[o]);
	                     }
	                 } else {
	                     throw "should not be reached";
	                 }
	             }).mousemove(function (e) {
	                 if (!self._obj) return;
					 if((self._drawMode!='p')&&(!self._start)) return; //some firebug errors resulting from 'self._start' null
	                 e.preventDefault();
	
	                 var cur = self._getCanvasXY(e);
	                 if (self._drawMode == 'r' || self._drawMode == 'e') {
							//return; //make the user use the selBB element instead to drag around box/ellipse
	                     if (!self._obj) return;
	
	                     var tl = {x: _.min([cur.x, self._start.x]), y: _.min([cur.y, self._start.y])},
	                     br = {x: _.max([cur.x, self._start.x]), y: _.max([cur.y, self._start.y])},
	                     halfWidth = (br.x-tl.x)/2,
	                     halfHeight = (br.y-tl.y)/2;
	
	                     if (self._drawMode == 'r') {
	                         self._obj.attr({
	                             x: tl.x, y: tl.y,
	                             width: br.x - tl.x,
	                             height: br.y - tl.y
	                         });
	                     } else if (self._drawMode == 'e') {
	                         self._obj.attr({
	                             cx: tl.x + halfWidth,
	                             cy: tl.y + halfHeight,
	                             rx: halfWidth,
	                             ry: halfHeight
	                         });
	                     } else {
	                         throw "should not be reached";
	                     }
	                 } else if (self._drawMode == 'p') {
	                     if (!self._points) return;
	
	                     var lp = _.last(self._points);
	                     lp.x = cur.x;
	                     lp.y = cur.y;
	                     self._obj.attr({"path": makePathStr(self._points)});
	                 } else if (self._drawMode == 's') {
	                     if (!self._start || !self._obj) return;
	                     var st = self._start;
	                     var o = self._obj;
	                     var rs = relScale(self, o);
	                     var shift = {x: (cur.x-st.x)/rs, y: (cur.y-st.y)/rs};
	                     o.newO = shiftShape(o, shift);
						 //updating the shape coords
						//need to relate info to tag displaying shape
	                    return; //making the selBB element be the element to move 
						if (o.con == "rect") {
	                         o.cur.attr({x: o.newO.x*rs, y: o.newO.y*rs*rs});
							
	                     } else if (self._obj.con == "ellipse") {
	                         o.cur.attr({cx: o.newO.cx*rs, cy: o.newO.cy*rs});
							 
	                     } else if (self._obj.con == "path") {
	                         o.cur.attr({path: makePathStr(_.each(o.newO.points, function(p){
	                         	return {x: p.x*rs, y: p.y*rs};
                         	 })) + " z"});
	                     } else {
	                         throw "should not be reached";
	                     }
	                 } else {
	                     throw "should not be reached";
	                 }
	             });
	             // doesn't figure out if our canvas has focus
	             // having multiple ops (in different canvases) seems pretty FUBAR, tho
	             $(document).keydown(function(e) {
	                 if (e.result == 1132423) return 1132423; // never again!
	
	                 // if it's escape, stop what we're doing
	                 if (e.keyCode === 27) {
	                     if (self._obj) self._obj.remove();
	                     self._start = self._obj = self._points = null;
	                 } else if ((e.keyCode === 46 || e.keyCode === 8)
	                           && self._drawMode == 's' && self._obj) {
	                     // delete or backspace
	                     var o = self._obj;
	                     if (o && confirm("You are about to delete annotation. Is that okay?")) {
	                         self._allObjs = _.reject(self._allObjs, function (c){return c == o;});
	                         o.cur.remove();
	                         self._start = self._obj = self._points = null;
	                     }
	                 }
	                 return 1132423;
	             });
	         }
			
		});


	rootNS.tile_vd=tile_vd;
	
})(jQuery, Raphael, _);

/* XXX revive overlayed objects for contrast
var p1 = paper.path("M10 10L90 90L10 90z");
p1.attr({"stroke": "black", "stroke-width": 1.5});
var p2 = paper.path("M10 10L90 90L10 90z");
p2.attr({"stroke": "white", "stroke-width": 0.5});
*/
//-------DEBUGGER-----------------
my_window = window.open("", "mywindow1", "scrollbars=yes,status=1,width=350,height=150");
my_window.document.write("<HTML><body><div>Begin</div></body></HTML>");

function debug(txt){
    var dbugLine = document.createElement("div");
    dbugLine.appendChild(document.createTextNode(txt));
    my_window.document.getElementsByTagName("body")[0].appendChild(dbugLine);
}

debug("starting");