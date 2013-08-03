/**
 * jQuery/Zepto Parallax Plugin
 * @author Matthew Wagerfield - @mwagerfield
 * @description Creates a parallax effect between an array of layers,
 *              driving the motion from the gyroscope output of a smartdevice.
 *              If no gyroscope is available, the cursor position is used.
 */
;(function($, window, document, undefined) {

  var NAME = 'parallax';
  var DEFAULTS = {
    transition: '0.5s cubic-bezier(0.165, 0.84, 0.44, 1)',
    calibrationThreshold: 100,
    calibrationDelay: 500,
    invertX: true,
    invertY: true,
    limitX: false,
    limitY: false,
    scalarX: 0.5,
    scalarY: 0.5
  };

  function Plugin(element, options) {

    // DOM Context
    this.element = element;

    // Selections
    this.$window = $(window);
    this.$context = $(element).data('api', this);
    this.$layers = this.$context.find('.layer');

    // Data Extraction
    var data = {
      transition: this.$context.data('transition') || null,
      invertX: this.$context.data('invert-x') || null,
      invertY: this.$context.data('invert-y') || null,
      limitX: parseFloat(this.$context.data('limit-x')) || null,
      limitY: parseFloat(this.$context.data('limit-y')) || null,
      scalarX: parseFloat(this.$context.data('scalar-x')) || null,
      scalarY: parseFloat(this.$context.data('scalar-y')) || null
    };

    // Delete Null Data Values
    for (var key in data) {
      if (data[key] === null) delete data[key];
    }

    // Compose Settings Object
    $.extend(this, DEFAULTS, options, data);

    // Set Transition Properties
    this.transition = 'all ' + this.transition;

    // States
    this.calibrationTimer = null;
    this.calibrationFlag = true;
    this.depths = [];
    this.raf = null;

    // Calibration
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;

    // Rotation
    this.rx = 0;
    this.ry = 0;
    this.rz = 0;

    // Offset
    this.ox = 0;
    this.oy = 0;

    // Initialise
    this.initialise();
  }

  Plugin.prototype.transformSupport = function(value) {
    var element = document.createElement('div');
    var id = 'crash-test-dummy';
    var propertySupport = false;
    var featureSupport = false;
    element.id = id;
    for (var i = 0, l = this.vendors.length; i < l; i++) {
      var vendorPrefix = this.vendors[i];
      var vendorProperty = vendorPrefix === null ? 'transform' : $.camelCase(vendorPrefix+'-transform');
      if (element.style[vendorProperty] !== undefined) {
        propertySupport = true;
        break;
      }
    }
    switch(value) {
      case '2D':
        featureSupport = propertySupport;
        break;
      case '3D':
        if (propertySupport) {
          // Testing technique taken from Modernizr
          // @see http://modernizr.com/
          var css = '@media (transform-3d),(-webkit-transform-3d){#'+id+'{left:9px;position:absolute;height:3px;}}';
          var style = document.createElement('style');
          style.type = 'text/css';
          if (style.styleSheet){
            style.styleSheet.cssText = css;
          } else {
            style.appendChild(document.createTextNode(css));
          }
          document.head.appendChild(style);
          document.body.appendChild(element);
          featureSupport = element.offsetLeft === 9 && element.offsetHeight === 3;
          document.head.removeChild(style);
          document.body.removeChild(element);
        }
        break;
    }
    return featureSupport;
  };

  Plugin.prototype.portrait = true;
  Plugin.prototype.vendors = ['O','ms','Moz','webkit',null];
  Plugin.prototype.motionSupport = window.DeviceMotionEvent !== undefined;
  Plugin.prototype.orientationSupport = window.DeviceOrientationEvent !== undefined;
  Plugin.prototype.transform2DSupport = Plugin.prototype.transformSupport('2D');
  Plugin.prototype.transform3DSupport = Plugin.prototype.transformSupport('3D');

  Plugin.prototype.initialise = function() {

    // Configure Styles
    if (this.$context.css('position') === 'static') {
      this.$context.css({
        position:'relative'
      });
    }
    this.$layers.css({
      position:'absolute',
      display:'block',
      height:'100%',
      width:'100%',
      left: 0,
      top: 0
    });
    this.$layers.first().css({
      position:'relative'
    });

    // Add Layer Transitions & Cache Depths
    this.$layers.each($.proxy(function(index, element) {
      this.depths.push($(element).data('depth') || 0);
      this.css(element, 'transition', this.transition);
    }, this));

    // Hardware Accelerate Elements
    this.accelerate(this.$context);
    this.accelerate(this.$layers);

    // Enable
    this.enable();
    this.calibrate(this.calibrationDelay);
  };

  Plugin.prototype.calibrate = function(delay) {
    clearTimeout(this.calibrationTimer);
    this.calibrationTimer = setTimeout($.proxy(function(){
      this.calibrationFlag = true;
    },this),delay);
  };

  Plugin.prototype.enable = function() {
    this.$window.on('deviceorientation', $.proxy(this.onDeviceOrientation, this));
    this.raf = requestAnimationFrame($.proxy(this.onAnimationFrame, this));
  };

  Plugin.prototype.disable = function() {
    this.$window.off('deviceorientation', this.onDeviceOrientation);
    cancelAnimationFrame(this.raf);
  };

  Plugin.prototype.invert = function(x, y) {
    this.invertX = x === undefined ? this.invertX : x;
    this.invertY = y === undefined ? this.invertY : y;
  };

  Plugin.prototype.scalar = function(x, y) {
    this.scalarX = x === undefined ? this.scalarX : x;
    this.scalarY = y === undefined ? this.scalarY : y;
  };

  Plugin.prototype.limit = function(x, y) {
    this.limitX = x === undefined ? this.limitX : x;
    this.limitY = y === undefined ? this.limitY : y;
  };

  Plugin.prototype.clamp = function(value, min, max) {
    value = Math.max(value, min);
    value = Math.min(value, max);
    return value;
  };

  Plugin.prototype.css = function(element, property, value) {
    for (var i = 0, l = this.vendors.length; i < l; i++) {
      var vendorPrefix = this.vendors[i];
      var vendorProperty = vendorPrefix === null ? property : $.camelCase(vendorPrefix+'-'+property);
      element.style[vendorProperty] = value;
    }
  };

  Plugin.prototype.accelerate = function($element) {
    $element.each($.proxy(function(index, element) {
      this.css(element, 'transform', 'translate3d(0,0,0)');
      this.css(element, 'transform-style', 'preserve-3d');
      this.css(element, 'backface-visibility', 'hidden');
    }, this));
  };

  Plugin.prototype.setPosition = function(element, x, y) {
    x += '%';
    y += '%';
    if (this.transform3DSupport) {
      this.css(element, 'transform', 'translate3d('+x+','+y+',0)');
    } else if (this.transform2DSupport) {
      this.css(element, 'transform', 'translate('+x+','+y+')');
    } else {
      element.style.left = x;
      element.style.top = y;
    }
  };

  Plugin.prototype.onAnimationFrame = function() {
    var dx = this.rx - this.cx;
    var dy = this.ry - this.cy;
    if ((Math.abs(dx) > this.calibrationThreshold) || (Math.abs(dy) > this.calibrationThreshold)) {
      this.calibrate(0);
    }
    if (this.portrait) {
      this.ox = dy * this.scalarX;
      this.oy = dx * this.scalarY;
    } else {
      this.ox = dx * this.scalarX;
      this.oy = dy * this.scalarY;
    }
    if (!isNaN(parseFloat(this.limitX))) {
      this.ox = this.clamp(this.ox, -this.limitX, this.limitX);
    }
    if (!isNaN(parseFloat(this.limitY))) {
      this.oy = this.clamp(this.oy, -this.limitY, this.limitY);
    }
    this.$layers.each($.proxy(function(index, element) {
      var depth = this.depths[index];
      var xOffset = this.ox * depth * (this.invertX ? -1 : 1);
      var yOffset = this.oy * depth * (this.invertY ? -1 : 1);
      this.setPosition(element, xOffset, yOffset);
    }, this));
    this.raf = requestAnimationFrame($.proxy(this.onAnimationFrame, this));
  };

  Plugin.prototype.onDeviceOrientation = function(event) {

    // Extract Rotation
    var x = event.beta  || 0; //  -90 :: 90
    var y = event.gamma || 0; // -180 :: 180
    var z = event.alpha || 0; //    0 :: 360

    // Detect Orientation Change
    var portrait = window.innerHeight > window.innerWidth;
    if (this.portrait !== portrait) {
      this.portrait = portrait;
      this.calibrationFlag = true;
    }

    // Set Calibration Rotation
    if (this.calibrationFlag) {
      this.calibrationFlag = false;
      this.cx = x;
      this.cy = y;
      this.cz = z;
    }

    // Set Rotation
    this.rx = x;
    this.ry = y;
    this.rz = z;
  };

  var API = {
    enable: Plugin.prototype.enable,
    disable: Plugin.prototype.disable,
    invert: Plugin.prototype.invert,
    scalar: Plugin.prototype.scalar,
    limit: Plugin.prototype.limit
  };

  $.fn[NAME] = function (value) {
    var args = arguments;
    return this.each(function () {
      var $this = $(this);
      var plugin = $(this).data(NAME);
      if (!plugin) {
        plugin = new Plugin(this, value);
        $this.data(NAME, plugin);
      }
      if (API[value]) {
        plugin[value].apply(plugin, Array.prototype.slice.call(args, 1));
      }
    });
  };

})(window.jQuery || window.Zepto, window, document);
