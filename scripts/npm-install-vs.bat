@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b 1

set "npm_config_cache=D:\Sarafi-Khata\.npm-cache"
set "npm_config_tmp=D:\Sarafi-Khata\.npm-tmp"
set "TEMP=D:\Sarafi-Khata\.npm-tmp"
set "TMP=D:\Sarafi-Khata\.npm-tmp"
set "npm_config_devdir=D:\Sarafi-Khata\.node-gyp"

if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"
if not exist "%npm_config_tmp%" mkdir "%npm_config_tmp%"
if not exist "%npm_config_devdir%" mkdir "%npm_config_devdir%"

cd /d "D:\Sarafi-Khata\sarafi-khata"
echo WindowsSdkDir=%WindowsSdkDir%
echo WindowsSDKVersion=%WindowsSDKVersion%
echo VCINSTALLDIR=%VCINSTALLDIR%
echo C free:
powershell -NoProfile -Command "[math]::Round((Get-PSDrive C).Free/1GB,2)"

npm install --cache "D:\Sarafi-Khata\.npm-cache"
exit /b %ERRORLEVEL%
