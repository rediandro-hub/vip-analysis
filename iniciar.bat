@echo off
chcp 65001 >nul
title VIP ANALYSIS - servidor local (mantenha aberta)
cd /d "%~dp0"
set PORTA=8766
set PY=
rem Prefere o lancador oficial "py"; testa se o Python roda de verdade (o atalho da Microsoft Store nao conta).
where py >nul 2>nul && py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && python -c "import sys" >nul 2>nul && set "PY=python"
if not defined PY where python3 >nul 2>nul && python3 -c "import sys" >nul 2>nul && set "PY=python3"
if not defined PY goto semPython
echo.
echo  VIP ANALYSIS - iniciando em http://localhost:%PORTA%/
echo  O navegador abre sozinho. MANTENHA ESTA JANELA ABERTA (pode minimizar).
echo  Ela consulta a ANEEL/SIGEL e o CAR, e guarda as bases SIGEF/SNCI e BDGD.
echo.
%PY% servidor.py %PORTA%
if errorlevel 1 (
  echo.
  echo  O servidor parou com erro. Veja a mensagem acima e mande um print dela.
  pause
)
goto :eof
:semPython
echo.
echo  Python nao encontrado neste computador.
echo  Instale em https://www.python.org/downloads/ marcando "Add python.exe to PATH"
echo  e depois abra este iniciar.bat de novo.
echo.
echo  Enquanto isso, a plataforma abre sem o servidor local: o mapa e a maioria das
echo  fontes funcionam, mas ANEEL/SIGEL, CAR por coordenada, SIGEF/SNCI e BDGD nao.
echo.
start "" "%~dp0index.html"
pause
