RC3200 Computer Virtual Machine
===============================

Using these [specs](https://github.com/Zardoz89/Trillek-Computer)

COMPILING
---------
Actually I'm using CMake and C++ 11. Needs std::chrono compilance for timings. SDL2 + OpenGL 3.1 is needed if you desire to see the virtual screen.

    mkdir build
    cd build
    cmake ..
    make
 
If all is OK, it should generate executables called **vm** and **benchmark**, and in ./src/ should be created static and shared libs of the VM core.

WHAT IT DOES ACTUALLY
------------------

### vm

- Can load a little endian binary file with a program. Has a 64KiB ROM were the program is uploaded. 128KiB of RAM begins at 0x10000 and ends at 0x30000.
- Step mode working with a on-line disassembler. Each time that you press a
  key, one instruction is executed, and the status of registers and stack, is
  shown. 'q' ends the execution.
- Run mode at what your computer can give. It does not enforce a particular speed, but it does compare the real speed against a CPU speed of 100KHz. Only stops by doing 'Ctrl+C'.
- If SDL2, GLM and OpenGL libs headers are found, then it will create a window of 800x600 showing a virtual screen.

### benchmark

- Can load a little endian binary file with a program. Has a 64KiB ROM were the program is uploaded. 128KiB of RAM begins at 0x10000 and ends at 0x30000.
- Trys to execute 1000 RC3200 CPUs in a single thread at what your computer can give. It does not enforce a particular speed, but it does compare the real speed against a CPU speed of 100KHz. Only stops by doing 'Ctrl+C'.

TESTS
-----

If instead of running "cmake ..", you may run "cmake -DBUILD_tests=True .." and some test programs will be compiled.

### test_cda

It tests the CDA VRAM to RGBA Texture routines, PBO texture streaming, and displays it in a virtual screen in 3D. This requires OpenGL 3.1 to work.
It has these shortcuts:

- 'n' Change to the next video/text mode
- 'wasd' orbits the camera around the virtual screen
- 'r' Zoom In
- 'f' Zoom Out

HOW I CAN CREATE PROGRAMS ?
---------------------------
Actually you can use <a href="https://github.com/Meisaka/WaveAsm" target="_blank">Meisaka's WaveAsm</a> to generate RC3200 machine code.

IMPLEMENTED DEVICES
-------------------

- CDA (need verification)
- Hardware Enumerator (need verification)


TODO
----

- Check that all instructions work as they should. -> Add more cases to test.asm
- Check that software interrupts work as they should.
- Improve the memory mapper as it is currently pretty inefficient if we add a lot of devices.
- Implement devices and check hardware interrupts. Actually implemented CDA device but it is not fully checked.
- Improve the vm API and document it better
- Create a vm factory class

