+function ($) { "use strict";

  // Trace function to console
  var debug_trace = true;
  function trace( msg ) {
    if (typeof debug_trace != 'undefined' && debug_trace) {
      if (window.console) {
          console.log(msg);
      } else if ( typeof( jsTrace ) != 'undefined' ) {
          jsTrace.send( msg );
      } else {
          //alert(msg);
      }
    }
  };

  // Beauty hexadecimal numbers
  function decimalToHex(d, padding) {
    if (d < 0)
    	d = 0xFFFFFFFF + d + 1;

    var hex = Number(d).toString(16).toUpperCase();
    padding = typeof (padding) === "undefined" || padding === null ? padding = 8 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
  }

  function isIE () {
    var myNav = navigator.userAgent.toLowerCase();
    return (myNav.indexOf('msie') != -1) ? parseInt(myNav.split('msie')[1]) : false;
  }

  /**
   * Convert JS KeyCodes from evt.keyCode to TR3200 keyboard codes
   */
  function JSKeyCodeToTR3200 (key) {
    switch (key) {
      case 16: // Shift
        return 0x0E; 
      
      case 17: // Control
        return 0x0F; 
    
      case 18:  // Alt
      case 225: // Alt Gr
        return 0x06;

      case 16: // Shift
        return 0x0E; 
    
      case 37: // Left arrow
        return 0x14; 
    
      case 38: // Up arrow
        return 0x12; 
    
      case 39: // Right arrow
        return 0x15; 
    
      case 40: // Down arrow
        return 0x13; 
    
      case 45: // Insert
        return 0x10; 
    
      case 46: // Delete
        return 0x05; 
  
      case 219: // Left Bracket
        return 0x5B;

      case 221: // Right Bracket
        return 0x5D;

      case 222: // Apostrophe (' ")
        return 0x27;

      case 188: // Comma (, < )
        return 0x2C;

      case 190: // Period (. >)
        return 0x2E;

      // TODO More cases

      default:
        return key;
    }
    return key;
  }

  var vm = new Module.VirtualComputer(128*1024);
  var cda = new Module.CDA(0,0);
  var key = new Module.GKeyboard(0,2);
  vm.AddKeyboard(3, key);
  vm.AddCDA(5, cda);

  // Generate a Buffer that bridges ToRGBATexture and WebGL texture 
  // Get data byte size, allocate memory on Emscripten heap, and get pointer
  var nBytes = 320*240*4;
  var texturePtr = Module._malloc(nBytes);

  // Creates a Type Array using this emscripten heap memory block
  var textureHeap = new Uint8Array(Module.HEAPU8.buffer, texturePtr, nBytes);
  for (var i=0; i < 320*240*4; i = i + 4) // And fill it of black
    textureHeap.set([0, 0 ,0 ,0], i);


  
  var canvas;         // Canvas were to write
  var mode2d = false; // We must use canvas 2D ?
  var context;        // Canvas 2D context
  var imageData;
  
  // WebGL stuff
  var gl;                       // WebGL context
  
  var shaderProgram;            // Id of linked shader program
  
  var glTexture;                // Id of WebGL texture were to paint CDA screen
  
  var VPBuffer;                 // Vertex Position Buffer
  var VTexCoordBuffer;          // Vertex UV coord Buffer
  var VIndexBuffer;             // Vertex Index Buffer
  
  var mvMatrix = mat4.create(); // Model-View matrix
  var mvMatrixStack = [];
  var pMatrix = mat4.create();  // Proy matrix

  /**
   * Inits WebGL stuff
   */
  function initGL(canvas) {
    gl = canvas.getContext("experimental-webgl");
    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
    
    if (!gl) {
      throw("Could not initialise WebGL, sorry :-(");
    }
  }

  // Grabs teh shader and compiles it
  function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    if (!shaderScript) {
      return null;
    }

    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
      if (k.nodeType == 3) {
        str += k.textContent;
      }
      k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
      shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
      shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
      return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw gl.getShaderInfoLog(shader);
      return null;
    }

    return shader;
  }

  // Initialize and load the shaders
  function initShaders() {
      var fragmentShader = getShader(gl, "shader-fs");
      var vertexShader = getShader(gl, "shader-vs");

      shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);

      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
          throw "Could not initialise shaders";
      }

      gl.useProgram(shaderProgram);

      shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
      gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

      shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
      gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

      shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
      shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
      shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");
  }

  /**
   * Updated Texture with CDA last state
   * Also In Canvas 2d API redraws it
   */
  function updateTexture(texture, cda) {
    if (mode2d) {
      cda.ToRGBATexture(texture.rawdata.byteOffset);
      var buf8 = new Uint8ClampedArray(texture.rawdata);
      imageData.data.set(buf8);
      // We paint in a temporal canvas to use canvas scale
      var newCanvas = $("<canvas>")
        .attr("width", 320)
        .attr("height", 240)[0];
      newCanvas.getContext("2d").putImageData(imageData, 0, 0);
      context.drawImage(newCanvas, 0, 0); 

    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      
      cda.ToRGBATexture(texture.rawdata.byteOffset);
    
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 
          0, 0 , 320, 240,
          gl.RGBA, gl.UNSIGNED_BYTE, texture.rawdata);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    cda.VSync();
  }
  
  /**
   * Cleans the texture
   */
  function cleanTexture(texture) {
    for (var i=0; i < 320*240*4; i = i + 4) // Fill screen texture of black
      texture.rawdata.set([0, 0 ,0 ,0], i);
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 
        0, 0 , 320, 240,
        gl.RGBA, gl.UNSIGNED_BYTE, texture.rawdata);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }


  // Sets the texture parameters and load a initial image
  function handleLoadedTexture(texture) {

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // Call function and get result
    cda.ToRGBATexture(texture.rawdata.byteOffset);
  
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 320, 240, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, texture.rawdata);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Init the texture
  function initTexture() {
    if (mode2d) {
      glTexture = {'rawdata' : textureHeap};
    } else {
      glTexture = gl.createTexture();
      glTexture.rawdata = textureHeap;
      handleLoadedTexture(glTexture)
    }
  }

  function mvPushMatrix() {
      var copy = mat4.create();
      mat4.set(mvMatrix, copy);
      mvMatrixStack.push(copy);
  }

  function mvPopMatrix() {
      if (mvMatrixStack.length == 0) {
          throw "Invalid popMatrix!";
      }
      mvMatrix = mvMatrixStack.pop();
  }

  function setMatrixUniforms() {
      gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
      gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
  }

  // Init Vertex Buffers
  function initBuffers() {
      VPBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, VPBuffer);
      var vertices = [
          // Front face
          -3.2, -2.4,  0.0,
           3.2, -2.4,  0.0,
           3.2,  2.4,  0.0,
          -3.2,  2.4,  0.0,
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      VPBuffer.itemSize = 3;
      VPBuffer.numItems = 4;

      VTexCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, VTexCoordBuffer);
      var textureCoords = [
        // Front face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
      ];
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
      VTexCoordBuffer.itemSize = 2;
      VTexCoordBuffer.numItems = 4;

      VIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, VIndexBuffer);
      var vertexIndices = [
          0, 1, 2,      0, 2, 3,    // Front face
      ];
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(vertexIndices), gl.STATIC_DRAW);
      VIndexBuffer.itemSize = 1;
      VIndexBuffer.numItems = 6;
  }

  // Update WebGL scene
  function drawSceneGL() {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.perspective(45, gl.viewportWidth / gl.viewportHeight, 0.1, 100.0, pMatrix);

    mat4.identity(mvMatrix);

    mat4.translate(mvMatrix, [0.0, 0.0, -6.0]);

    gl.bindBuffer(gl.ARRAY_BUFFER, VPBuffer);
    gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, VPBuffer.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, VTexCoordBuffer);
    gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, VTexCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);


    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.uniform1i(shaderProgram.samplerUniform, 0);
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, VIndexBuffer);
    setMatrixUniforms();
    gl.drawElements(gl.TRIANGLES, VIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);

    var error = gl.getError();
    if (error != gl.NO_ERROR && error != gl.CONTEXT_LOST_WEBGL) {
      trace ("WebGL error!");
      //mode2d = true;
    }
  }


  var canvas_init = false;
  // Init al canvas stuff and uses WebGL or 2d mode
  function setupCanvas(canvas) {
    if (!canvas_init) {
      if (! mode2d) {
        try {
          initGL(canvas);
          initShaders();
          initBuffers();
          initTexture();

          gl.clearColor(0.2, 0.2, 0.2, 1.0);
          gl.enable(gl.DEPTH_TEST);
    
          gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        } catch (e) {
          trace(e);
          mode2d = true;
        }
      }
      if(mode2d) {
        initTexture();
        context = canvas.getContext('2d');
        context.scale(canvas.width / 320.0, canvas.height / 240.0);
        imageData = context.createImageData(320, 240);

        context.fillStyle="#000000";
        context.fillRect(0,0, canvas.width, canvas.height);
      }
      canvas_init = true;
    }
  }


  // Main code to execute here ************************************************

  // Use to control timings
  var lastTime = new Date().getTime();
  var updTexTime = 40;
  var updSpeed = 3000;

  var cycles = 1750; // How many cycles are being executed in a bath
  var tms = (cycles / 100000.0) * 1000; // Time in ms that should be running

  var running = false;  // Looping ?
  var step_mode = false; // Step mode ?
  
  function tick() { // This is executed every tick
    if (running)
      requestAnimFrame(tick);

    var timeNow = new Date().getTime(); 
    if (lastTime != 0) {
      var elapsed = timeNow - lastTime;
      //trace("PC:" + vm.CPUState().pc);
      if (step_mode) {
        step_mode = false;
        var state = vm.CPUState();
        $('#pc_ex').text( decimalToHex(state.PC()) );
        $('#instr').text( vm.Disassembly() );
        state.delete();
        
        var ticks = vm.Step(elapsed);
        
        // TODO Update VM machine state display
        var state = vm.CPUState();
        for (var i=0; i <= 27; i++ ) {
          var r = state.R(i);
          $('#r' + i.toString() ).text( decimalToHex(r) );
        }
        
        $('#ia').text( decimalToHex(state.R(28)) );
        $('#flags').text( decimalToHex(state.R(29)) );
        $('#bp').text( decimalToHex(state.R(30)) );
        $('#sp').text( decimalToHex(state.R(31)) );

        state.delete();

      } else {
        vm.Tick(cycles, elapsed);
        cycles = (100000.0 * elapsed * 0.001);
        if (cycles <= 3)
          cycles = 3;

        if (cycles > 90000) // Dirty fix for clock.asm
          cycles = 90000;
      }

      updTexTime += elapsed;
      if (updTexTime >= 40) { // 25 FPS in milliseconds
        updateTexture(glTexture, cda);
        updTexTime -= 40;
      }

      updSpeed += elapsed;
      if (updSpeed >= 3000) {
        var speed = 100.0 * (tms / elapsed)
        $("#cpu_speed").text(speed.toPrecision(4) + " %");
        updSpeed -= 3000;
      }
    }

    if (! mode2d)
      drawSceneGL();
    
    lastTime = timeNow;
  }


  // Init all
  $('#load_btn').button();
  $('#run_btn').button();
  $('#run_btn').prop('disabled', true);
  $('#step_btn').button();
  $('#step_btn').prop('disabled', true);
  $('#reset_btn').button();
  $('#reset_btn').prop('disabled', true);

  canvas = document.getElementById('canvas1');
  canvas.addEventListener("webglcontextlost", function(evt) {
    evt.preventDefault();
  }, false);

  canvas.addEventListener("webglcontextrestored", function(evt) {
    setupCanvas(canvas);
  }, false);

  if ($('#webgl').prop('checked')) {
    mode2d = false;
  } else {
    mode2d = true;
  }

  // Attach event listeners ***************************************************
  // Run / Stop button
  $('#run_btn').on('click', function (evt) {
    if (running) {
      running = false;
      $('#run_btn').html('<span class="glyphicon glyphicon glyphicon-play"></span> Run');
      $('#reset_btn').prop('disabled', false);
      $('#step_btn').prop('disabled', false);
      $('#load_btn').prop('disabled', false);
    
    } else {
      running = true;
      tick();
      $('#run_btn').html('<span class="glyphicon glyphicon glyphicon-stop"></span> Stop');
      $('#reset_btn').prop('disabled', true);
      $('#step_btn').prop('disabled', true);
      $('#load_btn').prop('disabled', true);
    }
  });
  
  // Reset button
  $('#reset_btn').on('click', function (evt) {
    vm.Reset();

    if (!mode2d) {
      cleanTexture(glTexture);
      drawSceneGL();
    } else {
      context.fillStyle="#000000";
      context.fillRect(0,0, canvas.width, canvas.height);
    }
  });

  // Step button
  $('#step_btn').on('click', function (evt) {
    if (! running) {
      step_mode = true;
      tick();
    } 
  });
 
  // File chooser
  var selector = $('#romfile');
  if (isIE()) { // Piece of crap of IE !!!
    // IE suspends timeouts until after the file dialog closes
    selector.click(function(event) {
      setTimeout(function() {
        if(selector.val().length > 0) {
          if (selector[0].files.length > 0) {
            $('#load_btn').prop('disabled', false);
          } else {
            $('#load_btn').prop('disabled', true);
          }
        }
      }, 0);
    });
  } else {
    selector.on('change', function (evt) {
      if (selector[0].files.length > 0) {
        $('#load_btn').prop('disabled', false);
      } else {
        $('#load_btn').prop('disabled', true);
      }
    });
  }
  if (selector[0].files.length > 0) {
    $('#load_btn').prop('disabled', false);
  } else {
    $('#load_btn').prop('disabled', true);
  }

  // Load button
  $('#load_btn').on('click', function (evt) {
    if (! running) { // Not running, we try to load the ROM file
      var selector = $('#romfile');
      // Check for the various File API support.
      if (window.File && window.FileReader && window.FileList && window.Blob) {
        var files = selector[0].files; // FileList object
        var file = files[0];
        var reader = new FileReader();

        reader.onload = (function(theFile){
          return function(e) {

            var bytes = theFile.size;
            if (bytes > 64*1024)
              bytes = 64*1024;

            trace("Loaded ROM file : " + theFile.name + " Size of : " + bytes);
            if (bytes < 1024) {
              $("#rom_size").text(bytes + " Bytes");
            } else {
              $("#rom_size").text((bytes/1024.0).toPrecision(4) + " KiB");
            }

            var filePtr;
            var fileHeap;
            // Get data byte size, allocate memory on Emscripten heap, and get pointer
            filePtr = Module._malloc(bytes); 
            // Creates a Type Array using this emscripten heap memory block
            fileHeap = new Uint8Array(Module.HEAPU8.buffer, filePtr, bytes);
            var tmp = new Uint8Array(reader.result, 0, bytes);
            fileHeap.set(tmp);
            vm.WriteROM(fileHeap.byteOffset, bytes);
            // Free memory
            Module._free(fileHeap.byteOffset);

          };
        })(file);
        
        reader.readAsArrayBuffer(file)
        $("#run_btn").prop('disabled', false);
        $('#step_btn').prop('disabled', false);
        $('#reset_btn').prop('disabled', false);

        setupCanvas(canvas);

        $('#webgl').prop('checked', ! mode2d);
        $('#webgl').prop('disabled', true);

        vm.Reset(); // Enforces reset
      } else {
        trace('The File APIs are not fully supported in this browser.');
      }

    } else {
    }
  });


  // WebGL checkbox
  $('#webgl').on('change', function (evt) {
    if ($('#webgl').prop('checked')) {
      mode2d = false;
    } else {
      mode2d = true;
    }
  });

  // Stores keyboard status
  var keyb = {
    'shift_key' : false,
    'caps_lock' : false,
  };

  $(document).on('keydown', function (evt) {
    // read : http://unixpapa.com/js/key.html
    if (running) {
      evt.preventDefault(); // Not anoying quick search in firefox
      if (evt.repeat)
        return false; // Stops anoying repeat
      
      /*var k = evt.keyCode;  // Note this gets scancodes !!!
      if (k == 16) // Shift key
        keyb.shift_key = true;
      
      if (k == 20) // Caps locks key
        keyb.caps_lock = ! keyb.caps_lock;
      var uppercase = (keyb.caps_lock && !keyb.shift_key) || (!keyb.caps_lock && keyb.shift_key) ;
      if (! uppercase && (k >= 65 && k <= 90 )) // Undercase the scan codes
        k = k +32;*/
      var k = JSKeyCodeToTR3200(evt.keyCode);
      key.PushKeyEvent (true, k);
    }
    return false;
  });
  
  $(document).on('keyup', function (evt) {
    if (running) {
      evt.preventDefault();
      /*
      var k = evt.keyCode;
      if (k == 16) // Shift key
        keyb.shift_key = false;

      var uppercase = (keyb.caps_lock && !keyb.shift_key) || (!keyb.caps_lock && keyb.shift_key) ;
      if (! uppercase && (k >= 65 && k <= 90 ))
        k = k +32;*/
      var k = JSKeyCodeToTR3200(evt.keyCode);
      key.PushKeyEvent (false, k);
    }
    return false;
  });

  // Misc
  $('[data-toggle="tooltip"]').tooltip({'placement': 'top'});

}(jQuery);

