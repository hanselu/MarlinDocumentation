/**
 * U8Glib bitmap converter
 * Copyright (C) 2016 João Brázio [https://github.com/jbrazio]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * By : @jbrazio
 *      @thinkyhead
 *
 * Todo:
 * - Composite status image from logo, nozzle, bed, fan
 * - Slider for threshold (jQuery.ui)
 * - Buttons to shift the image
 * - Show preview image in B/W converted
 * - Show original image (float right)
 *
 */

window.bitmap_converter = function() {

  var preview_scale = 4,
      $large = $('#preview-lg');

  if (typeof $large[0].getContext == 'undefined') return;

  var $small      = $('#preview-sm'),
      $img        = $('<img/>'),
      ctx         = $large[0].getContext('2d'),
      ctx_sm      = $small[0].getContext('2d'),
      $filein     = $('#file-input'),
      $err        = $('#err-box'),
      $outdiv     = $('#cpp-container'),
      $output     = $('#output'),
      $binary     = $('#bin-on'),
      $ascii      = $('#ascii-on'),
      $skinny     = $('#skinny-on'),
      $hotends    = $('#hotends'),
      $bed        = $('#bed-on'),
      $fan        = $('#fan-on'),
      $type       = $('input[name=bitmap-type]'),
      $statop     = $('#stat-sub'),
      $oldon      = $('#old-on'),
      $olddata    = $('#olddata'),
      field_arr = [$binary[0], $ascii[0], $skinny[0], $hotends[0], $bed[0], $fan[0], $type[0]],
      tohex       = function(b) { return '0x' + ('0' + (b & 0xFF).toString(16)).toUpperCase().slice(-2); },
      tobin       = function(b) { return 'B' + ('0000000' + (b & 0xFF).toString(2)).slice(-8); },
      random_name = function(prefix) { return prefix + Math.random().toString(36).substring(7); },
      rnd_name,
      count = 0;

  var error_message = function(msg) {
    $err.text(msg).show(); console.log(msg);
  };

  // Convert the small canvas bits into C++
  var generate_cpp = function(e) { //console.log("generate_cpp() " + (++count));

    // Get the image width and height in pixels.
    var iw = $img[0].width, ih = $img[0].height;

    // Reject images that are too big
    // TODO: Scale images down if needed
    // TODO: Threshold sliders for luminance range to capture.
    if (iw > 128 || ih > 64)
      return error_message("Image too large for display. Maximum 128 x 64.");

    // Prepare the small hidden canvas to receive the image
    ctx_sm.canvas.width  = iw;
    ctx_sm.canvas.height = ih;

    // Scaled view so you can actually see the pixels
    ctx.canvas.width  = iw * preview_scale;
    ctx.canvas.height = ih * preview_scale;

    // Disable pixel smoothing in the larger canvas
    ctx.mozImageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = 'medium';
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    // Draw the image into both canvases
    [ctx_sm, ctx].forEach(function(c,i) { c.drawImage($img[0], 0, 0, c.canvas.width, c.canvas.height); });

    // Threshold filter the image into the out[] array
    var buffer = ctx_sm.getImageData(0, 0, iw, ih).data,  // Grab the image data
        out = [];
    for (var i = 0; i < iw * ih * 4; i += 4)
      out.push(127 > buffer[i] * 0.3 + buffer[i+1] * 0.59 + buffer[i+2] * 0.11);

    var bytewidth = Math.ceil(iw / 8),                    // Bytes wide is important

        type = $type.filter(':checked').val(),            // The selected output type
        name = type == 'boot' ? 'custom_start_bmp' :
               type == 'stat' ? 'status_screen0_bmp' :
               rnd_name,

        is_bin = $binary[0].checked,                      // Flags for binary, ascii, and narrow ascii
        tobase = is_bin ? tobin : tohex,
        zero = is_bin ? 'B00000000' : '0x00',

        is_asc = $ascii[0].checked,                       // Include ASCII version of the bitmap?
        is_thin = $skinny[0].checked,                     // A skinny ASCII output with blocks.

        is_stat = type == 'stat',                         // "Status" has extra options
        extra_x = is_stat ? 16 - bytewidth : 0,           // For now, pad lines with 0x00. TODO: Status screen composer.
        extra_y = is_stat ? 19 - ih : 0;                  // Pad Y up to 19 lines.

    if (extra_x < 0) extra_x = 0;
    if (extra_y < 0) extra_y = 0;

    //
    // Convert the b/w image bits to C++ suitable for Marlin
    //
    var cpp = '//\n// Made with Marlin Bitmap Converter\n// http://marlinfw.org/tools/u8glib/converter.html\n//\n' +
              '// Width: ' + (iw + extra_x * 8) + ', Height: ' + (ih + extra_y) + '\n';

    if (type == 'boot') {
      cpp += '#define CUSTOM_BOOTSCREEN_BMPWIDTH  ' + iw + '\n' +
             '#define CUSTOM_BOOTSCREEN_BMPHEIGHT ' + ih + '\n';

    }

    cpp += 'const unsigned char ' + name + '[] PROGMEM = {\n';

    var lastx = iw - 8 - (iw % 8);          // last item in each line
    for (var y = 0; y < ih; y++) {          // loop Y
      var bitline = ' // ';
      cpp += '  ';
      for (var x = 0; x < iw; x += 8) {     // loop X
        var byte = 0;
        for (var b = 0; b < 8; b++) {       // loop 8 bits
          var xx = x + b, i = y * iw + xx,
              bb = xx < iw && out[i];       // a set bit?
          byte = (byte << 1) | bb;          // add to the byte
          bitline += is_thin
                     ? b % 2 ? [' ','▐','▌','█'][byte & 3] : ''
                     : bb ? '#' : ' ';
        }
        cpp += tobase(byte)
             + (x == lastx && y == ih - 1 && !extra_x && !extra_y ? ' ' : ',');
      }
      // Fill out the rest of the lines for stat
      for (var x = extra_x; x--;) cpp += zero + (x || y < ih - 1 || extra_y ? ',' : ' ');
      cpp += (is_asc ? bitline : '') + '\n';
    }
    if (extra_y) {
      for (var y = extra_y; y--;) {
        cpp += '  ';
        for (var x = 16; x--;)
          cpp += zero + (x || y ? ',' : '');
        cpp += '\n';
      }
    }

    cpp += '};\n';

    if (is_stat)
      if ($fan[0].checked)
        cpp += '\n// TODO: Add a second array with FAN FRAME 2 included.\n'
      else
        cpp += '\nconst unsigned char *status_screen1_bmp = status_screen0_bmp;\n'

    $output.val(cpp).attr({ rows:(cpp.match(/\n/g)||[]).length + 1 });
    $outdiv.show();
    $large.show();

    $('#where').html(
      type == 'boot' ? '<strong><tt>_Bootscreen.h</tt></strong>' :
      type == 'stat' ? '<strong><tt>_Statusscreen.h</tt></strong>' :
      'program'
    );
    return false;
  };

  //
  // Get ready to evaluate incoming data
  //
  var prepare_for_new_image = function() {
    // Hide error, preview, and output box
    $([$err[0], $large[0], $outdiv[0]]).hide();

    // Don't regenerate C++ on image change or form editing
    $img.off();
    $(field_arr).off();

    // ASCII is tied to the Narrow option
    $ascii.change(function(){ $skinny.attr('disabled', !this.checked); return false; });

    // For output type "Status" show more options
    $type.change(function() {
      if ($(this).val() == 'stat') $statop.show(); else $statop.hide();
    });
  };

  //
  // Set the image src to some new data.
  // This will fire $img.load when the data is ready.
  //
  var load_data_into_image = function(data) {
                                        // Generate C++ whenever...
    $(field_arr).change(generate_cpp);  //  Form values are changed
    $img.load(generate_cpp)             //  The image loads new content
        .attr({ src:data });            // Start loading image data

    rnd_name = random_name('bitmap_');  // A new bitmap name on each file load
  };

  var restore_olddata_field = function() {
    $olddata.val('Paste Marlin bitmap data here.').css({ color:'', fontSize:'' });
  };

  //
  // Convert C++ data array back into an image
  // assuming that lines match up.
  //
  var legacy_data_to_image = function(e) {
    //console.log(e);
    var cpp = $olddata.val(),
        dat = [],
        wide = 0, high = 0;

    prepare_for_new_image();
    restore_olddata_field();

    // Get the split up bytes on all lines
    var lens = [], mostlens = [];
    $.each(cpp.split('\n'), function(i,s) {
      var pw = 0;
      $.each(s.replace(/[ \t]/g,'').split(','), function(i,s) {
        if (s.match(/0x[0-9a-f]+/i) || s.match(/0b[01]+/) || s.match(/B[01]+/) || s.match(/[0-9]+/))
          ++pw;
      });
      lens.push(pw);
      mostlens[pw] = 0;
    });

    // Find the length with the most instances
    var most_so_far = 0;
    mostlens.fill(0);
    $.each(lens, function(i,v){
      if (++mostlens[v] > most_so_far) {
        most_so_far = mostlens[v];
        wide = v * 8;
      }
    });

    if (!wide) return true;

    // Split up lines and iterate
    var bitmap = [], bitstr = '';
    $.each(cpp.split('\n'), function(i,s) {
      s = s.replace(/[ \t]/g,'');
      // Split up bytes and iterate
      var byteline = [], len = 0;
      $.each(s.split(','), function(i,s) {
        var b;
        if (s.match(/0x[0-9a-f]+/i))          // Hex
          b = parseInt(s.substring(2), 16);
        else if (s.match(/0b[01]+/))          // Binary
          b = parseInt(s.substring(2), 2);
        else if (s.match(/B[01]+/))           // Binary
          b = parseInt(s.substring(1), 2);
        else if (s.match(/[0-9]+/))           // Decimal
          b = s * 1;
        else
          return true;                        // Skip this item

        for (var i = 0; i < 8; i++) {
          if (b & 0x80)
            byteline.push(0, 0, 0, 255);      // Black color
          else
            byteline.push(240, 255, 255, 255); // White color
          b <<= 1;
        }
        len += 8;
      });
      if (len == wide) bitmap.push(byteline);
    });

    high = bitmap.length;
    if (!high) {
      error_message("Fuk yu!");
      return true;
    }

    ctx_sm.canvas.width  = wide;
    ctx_sm.canvas.height = high;

    var i = 0, image_data = ctx_sm.createImageData(wide, high);
    for (var y = 0; y < high; y++)
      for (var x = 0; x < wide * 4; x++)
        image_data.data[i++] = bitmap[y][x];

    ctx_sm.putImageData(image_data, 0, 0);

    var img = $img[0];
    img.width = wide;
    img.height = high;
    load_data_into_image($small[0].toDataURL('image/png'));
  };

  // Create a file reader with responder for successful load
  var reader = new FileReader();

  //
  // File Reader Load Event
  //
  $(reader).load(function() { //console.log("$(reader).load");
    load_data_into_image(this.result);
    return false;                       // No default handler
  }); // reader.load function

  //
  // File Input Change Event
  //
  // If the file input value changes try to read the data from the file.
  // The reader.load() handler will fire on successful load.
  //
  $filein.change(function() { //console.log("$filein.change");

    prepare_for_new_image();

    var file = $filein[0].files[0];
    if (file)
      reader.readAsDataURL(file); // Read the file data, fire 'load' when done.
    else
      error_message("Error opening file.");

    return false;                         // No default handler
  }); // $filein.change function

  // Enable standard form field events
  prepare_for_new_image();

  // Set a friendly message for C++ data paste
  restore_olddata_field();

  // Toggle for the Old Data field
  $oldon.change(function(){
    if (this.checked) {
      $olddata.show();
      $filein.hide();
    }
    else {
      $olddata.hide();
      $filein.show();
    }
    return false;
  });

  // If the output is clicked, select all
  $output.bind('focus click', function() { this.select(); });

  // Paste old C++ code to see the image and reformat
  $olddata.bind('focus click', function(){ $(this).val(''); });

  $olddata.bind('paste', function(){ $(this).css({ color:'#000', fontSize:'100%' }); });
  $olddata.bind('keyup', function(){ $(this).trigger('blur'); });
  $olddata.bind('blur', legacy_data_to_image);
}

head.ready(window.bitmap_converter);
