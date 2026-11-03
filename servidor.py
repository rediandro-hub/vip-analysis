#!/usr/bin/env python3
"""VIP ANALYSIS — servidor local.

Faz três coisas, só com a biblioteca padrão do Python 3.8+:
  1. Serve a plataforma em http://localhost:8766/ (e a Bateia em /bateia/).
  2. Proxy restrito para os órgãos que bloqueiam o navegador (CORS), como a ANEEL/SIGEL:
       * só GET;  * só domínios da lista PERMITIDOS;  * só escuta em 127.0.0.1;
       * respostas válidas ficam em cache por 12 horas (pasta cache/, pode ser apagada).
  3. Bases por estado do INCRA (SIGEF e SNCI) e BDGD da ANEEL: baixa e guarda em Documentos > VIP ANALYSIS > dados
     (fora da pasta do programa, para valer em todas as versões)
     e responde consultas por retângulo (bbox) em GeoJSON — o WFS do Acervo Fundiário
     está fora do ar e o portal passou a exigir login, então a base local é o caminho estável.

Uso: python servidor.py [porta]      (padrão 8766)
"""
import array
import base64
import datetime
import hashlib
import importlib
import json
import math
import mmap
import os
import pathlib
import re
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.abspath(__file__))


def pasta_documentos():
    """Pasta Documentos do usuário (no Windows, a real — inclusive quando redirecionada para o OneDrive)."""
    if os.name == "nt":
        try:
            import ctypes
            buf = ctypes.create_unicode_buffer(1024)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0 and buf.value:  # CSIDL_PERSONAL
                return buf.value
        except Exception:  # noqa: BLE001
            pass
    casa = os.path.expanduser("~")
    for nome in ("Documents", "Documentos"):
        if os.path.isdir(os.path.join(casa, nome)):
            return os.path.join(casa, nome)
    return casa


# Bases baixadas (SIGEF/SNCI, BDGD) e cache ficam FORA da pasta do programa: uma versão nova já encontra tudo.
# Para usar outra pasta, defina a variável de ambiente VIP_ANALYSIS_DADOS.
# Se Documentos estiver no OneDrive, usa C:\Users\<usuário>\VIP ANALYSIS: as bases têm centenas de MB a GB e
# não devem ser enviadas à nuvem (nem virar arquivos "só online", que o servidor não consegue ler).
DOCUMENTOS = pasta_documentos()
PASTA_DOCS = os.path.join(DOCUMENTOS, "VIP ANALYSIS")
PASTA_USUARIO = os.environ.get("VIP_ANALYSIS_DADOS") or (
    os.path.join(os.path.expanduser("~"), "VIP ANALYSIS") if "onedrive" in DOCUMENTOS.lower() else PASTA_DOCS)
DADOS = os.path.join(PASTA_USUARIO, "dados")
CACHE = os.path.join(PASTA_USUARIO, "cache")
RELATORIOS = os.path.join(PASTA_USUARIO, "relatorios")


# ---------------------------------------------------------------------------------------------------
# PDF do relatório: o Edge (ou o Chrome) do próprio Windows imprime a página sem abrir janela, o arquivo vai
# para Documentos > VIP ANALYSIS > relatorios e abre no leitor de PDF padrão.
# ---------------------------------------------------------------------------------------------------
def navegador_pdf():
    env = os.environ.get("VIP_NAVEGADOR_PDF")
    if env and os.path.isfile(env):
        return env
    candidatos = []
    if os.name == "nt":
        for base in (os.environ.get("PROGRAMFILES(X86)"), os.environ.get("PROGRAMFILES"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidatos += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                               os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
    else:
        for nome in ("microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            caminho = shutil.which(nome)
            if caminho:
                candidatos.append(caminho)
        candidatos += ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    for c in candidatos:
        if c and os.path.isfile(c):
            return c
    return None


def nome_pdf_livre(nome, ext="pdf"):
    seguro = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", nome).strip(" .-")[:140] or "relatorio"
    caminho = os.path.join(RELATORIOS, f"{seguro}.{ext}")
    n = 2
    while os.path.exists(caminho):
        caminho = os.path.join(RELATORIOS, f"{seguro} ({n}).{ext}")
        n += 1
    return caminho


TIPOS_ARQUIVO = {"pdf": "application/pdf", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}


def salvar_arquivo(base64_txt, nome, ext):
    """Grava um arquivo gerado no navegador (PowerPoint dos slides) na pasta de relatórios."""
    if ext not in TIPOS_ARQUIVO:
        raise ValueError("tipo de arquivo não permitido")
    dados = base64.b64decode(base64_txt.split(",", 1)[-1], validate=False)
    if ext == "pptx" and not dados.startswith(b"PK"):
        raise ValueError("o PowerPoint gerado está corrompido")
    os.makedirs(RELATORIOS, exist_ok=True)
    destino = nome_pdf_livre(nome, ext)
    with open(destino, "wb") as f:
        f.write(dados)
    return destino


def gerar_pdf(html, nome):
    exe = navegador_pdf()
    if not exe:
        raise ValueError("não encontrei o Microsoft Edge nem o Google Chrome neste computador para gerar o PDF; use o botão Imprimir › Salvar como PDF")
    os.makedirs(RELATORIOS, exist_ok=True)
    destino = nome_pdf_livre(nome)
    tmp = tempfile.mkdtemp(prefix="vip_pdf_")
    try:
        pagina = os.path.join(tmp, "relatorio.html")
        with open(pagina, "w", encoding="utf-8") as f:
            f.write(html)
        saida = os.path.join(tmp, "saida.pdf")
        url = pathlib.Path(pagina).resolve().as_uri()
        base = [exe, "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                "--disable-background-networking", f"--user-data-dir={os.path.join(tmp, 'perfil')}",
                "--run-all-compositor-stages-before-draw", "--virtual-time-budget=30000", f"--print-to-pdf={saida}"]
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            base.insert(1, "--no-sandbox")  # Linux como root (servidores); no Windows não se aplica
        ultimo = ""
        for modo in (["--headless=new", "--no-pdf-header-footer"], ["--headless", "--print-to-pdf-no-header"]):
            try:
                r = subprocess.run(base[:1] + modo + base[1:] + [url], capture_output=True, timeout=240,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                ultimo = (r.stderr or b"").decode("utf-8", "replace")[-300:]
            except subprocess.TimeoutExpired:
                ultimo = "o navegador não terminou em 4 minutos"
            if os.path.isfile(saida) and os.path.getsize(saida) > 2000:
                with open(saida, "rb") as f:
                    if f.read(5) == b"%PDF-":
                        break
        else:
            raise ValueError("o navegador não gerou o PDF" + (f" ({ultimo.strip()[:200]})" if ultimo.strip() else ""))
        shutil.move(saida, destino)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return destino


def abrir_arquivo(caminho):
    try:
        if os.name == "nt":
            os.startfile(caminho)  # noqa: S606 — abre no leitor de PDF padrão do Windows
        elif sys.platform == "darwin":
            subprocess.Popen(["open", caminho])
        elif os.environ.get("DISPLAY") and shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", caminho])
        else:
            return False
        return True
    except Exception:  # noqa: BLE001
        return False



def migrar_bases():
    """Leva para a pasta permanente as bases que versões anteriores guardaram dentro da própria pasta
    (esta e as irmãs vip-analysis-v*). Não sobrescreve nada que já exista no destino."""
    movidas = []
    origens = [os.path.join(RAIZ, "dados"), os.path.join(PASTA_DOCS, "dados")]
    pai = os.path.dirname(RAIZ)
    for raiz in (pai, os.path.dirname(pai)):  # versões extraídas lado a lado (…\vip-analysis-v0.3.2 e …\vip-analysis-v0.3.3\VIP ANALYSIS)
        try:
            for nome in os.listdir(raiz):
                p = os.path.join(raiz, nome)
                if os.path.isdir(p) and re.match(r"(?i)^vip[-_ ]?analysis", nome):
                    origens += [os.path.join(p, "dados"), os.path.join(p, "VIP ANALYSIS", "dados")]
        except OSError:
            pass
    os.makedirs(DADOS, exist_ok=True)
    destino_real = os.path.realpath(DADOS)
    for org in origens:
        if not os.path.isdir(org) or os.path.realpath(org) == destino_real:
            continue
        for nome in os.listdir(org):
            if not (re.match(r"^(sigef|snci|bdgd)_", nome) or nome.startswith("bdgd_catalogo")) or nome.endswith((".nova", ".velha")):
                continue
            src, dst = os.path.join(org, nome), os.path.join(DADOS, nome)
            if os.path.exists(dst):
                continue
            try:
                shutil.move(src, dst)
                movidas.append(nome)
            except OSError as e:
                log(f"  não foi possível mover {src}: {e}")
    return movidas
VALIDADE_CACHE_S = 12 * 3600
TIMEOUT_S = 60
LIMITE_BYTES = 80 * 1024 * 1024
LIMITE_UPLOAD = 3 * 1024 * 1024 * 1024
VERSAO = "0.4.2"

PERMITIDOS = {
    # mineração e geologia
    "geo.anm.gov.br", "app.anm.gov.br", "sistemas.anm.gov.br", "geoportal.sgb.gov.br",
    # energia e infraestrutura
    "sigel.aneel.gov.br", "gisepeprd2.epe.gov.br", "servicos.dnit.gov.br",
    # fundiário
    "geoserver.car.gov.br", "consulta.car.gov.br", "acervofundiario.incra.gov.br", "certificacao.incra.gov.br", "geoserver.funai.gov.br",
    "geoservicos.sgb.gov.br", "api.open-meteo.com", "archive-api.open-meteo.com", "www.arcgis.com",
    # rotas por estrada (ficha do local)
    "router.project-osrm.org",
    # ambiental e referência
    "geoservicos.inde.gov.br", "terrabrasilis.dpi.inpe.br", "mapas.mma.gov.br",
    "servicodados.ibge.gov.br", "geoservicos.ibge.gov.br",
    # OpenStreetMap (rede elétrica de distribuição e nomes de lugares)
    "overpass-api.de", "overpass.kumi.systems", "overpass.private.coffee", "nominatim.openstreetmap.org",
    # imagem de satélite dos mapas dos slides (Esri World Imagery)
    "server.arcgisonline.com", "services.arcgisonline.com",
}
UFS = {"AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"}
AGENTE = f"VIP-ANALYSIS/{VERSAO} (analise territorial; uso interno)"

FONTES_BASE = {
    "sigef": {
        "nome": "SIGEF — parcelas certificadas",
        "urls": ["https://certificacao.incra.gov.br/csv_shp/zip/Sigef%20Brasil_{uf}.zip"],
    },
    "snci": {
        "nome": "SNCI — imóveis certificados até 2013",
        "urls": [
            "https://certificacao.incra.gov.br/csv_shp/zip/Im%C3%B3vel%20certificado%20SNCI%20Brasil_{uf}.zip",
            "https://certificacao.incra.gov.br/csv_shp/zip/Imovel%20certificado%20SNCI%20Brasil_{uf}.zip",
        ],
    },
}


def log(msg):
    try:
        print(msg, flush=True)
    except Exception:  # noqa: BLE001 — console sem suporte a acentos
        print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


# ============================================================================
# Rede: TLS tolerante (sem desligar a verificação) + cache
# ============================================================================
def _contextos_ssl():
    """Contextos TLS em ordem de tentativa; todos verificam o certificado.
    `truststore` (opcional) usa a validação do Windows, que completa cadeias incompletas."""
    contextos = []
    try:
        import truststore  # pip install truststore (opcional)
        contextos.append(truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT))
    except Exception:  # noqa: BLE001
        pass
    contextos.append(ssl.create_default_context())
    legado = ssl.create_default_context()
    try:
        legado.set_ciphers("DEFAULT:@SECLEVEL=1")
    except ssl.SSLError:
        pass
    contextos.append(legado)
    return contextos


CONTEXTOS = _contextos_ssl()


def motivo_dns(host):
    """Nome que não resolve: o endereço saiu do ar (o resto da internet funciona) ou o computador está sem internet."""
    try:
        socket.getaddrinfo("www.google.com", 443)
        return (f"o endereço {host} não existe na internet agora (o órgão tirou do ar ou mudou o endereço) — "
                f"não é problema no seu computador")
    except OSError:
        return f"sem internet: não foi possível encontrar {host} (verifique a conexão)"


def abrir_url(url, timeout=TIMEOUT_S):
    """urlopen com os contextos TLS em sequência. Levanta HTTPError ou ConnectionError legível."""
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "*/*"})
    ultimo = None
    for ctx in CONTEXTOS:
        try:
            return urllib.request.urlopen(req, timeout=timeout, context=ctx)
        except urllib.error.HTTPError:
            raise
        except urllib.error.URLError as e:
            if isinstance(e.reason, (ssl.SSLError, ConnectionResetError)):
                ultimo = e.reason
                continue
            host = urllib.parse.urlsplit(url).hostname
            if isinstance(e.reason, socket.gaierror):
                raise ConnectionError(motivo_dns(host)) from e
            raise ConnectionError(f"sem conexão com {host}: {e.reason}") from e
        except (ssl.SSLError, ConnectionResetError) as e:
            ultimo = e
            continue
    if isinstance(ultimo, ssl.SSLCertVerificationError):
        raise ConnectionError(f"certificado TLS não verificado ({ultimo.verify_message}). Instale: pip install truststore")
    raise ConnectionError(f"falha na conexão segura: {ultimo}")


def _arquivo_cache(url):
    return os.path.join(CACHE, hashlib.sha256(url.encode("utf-8")).hexdigest() + ".bin")


def _cacheavel(corpo):
    inicio = corpo[:400].lower()
    return len(corpo) > 0 and b'"error"' not in inicio and b"serviceexception" not in inicio and b"exceptionreport" not in inicio


def buscar(url, fresco=False):
    """(status, content_type, corpo, origem 'cache'|'rede', idade_s)
    fresco=True ignora o cache (fontes críticas, como o SIGMINE, onde vale quem protocola primeiro)."""
    caminho = _arquivo_cache(url)
    if not fresco and os.path.exists(caminho) and time.time() - os.path.getmtime(caminho) < VALIDADE_CACHE_S:
        idade = int(time.time() - os.path.getmtime(caminho))
        with open(caminho, "rb") as f:
            n = int.from_bytes(f.read(4), "big")
            meta = json.loads(f.read(n).decode("utf-8"))
            return 200, meta["tipo"], f.read(), "cache", idade
    try:
        with abrir_url(url) as r:
            corpo = r.read(LIMITE_BYTES + 1)
            if len(corpo) > LIMITE_BYTES:
                raise ValueError("resposta maior que o limite de 80 MB")
            tipo = r.headers.get("Content-Type", "application/octet-stream")
            if _cacheavel(corpo):
                os.makedirs(CACHE, exist_ok=True)
                meta = json.dumps({"url": url, "tipo": tipo}).encode("utf-8")
                with open(caminho, "wb") as f:
                    f.write(len(meta).to_bytes(4, "big") + meta + corpo)
            return r.status, tipo, corpo, "rede", 0
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", "text/plain"), e.read(4096), "rede", 0


# ============================================================================
# Shapefile + DBF (só leitura), com índice espacial em grade
# ============================================================================
CELULA = 0.05  # graus (~5,5 km)
TIPOS_SHP = (1, 11, 21, 3, 13, 23, 5, 15, 25)


class ErroBase(Exception):
    pass


def _horario(xs, ys):
    s = 0.0
    for i in range(len(xs) - 1):
        s += (xs[i + 1] - xs[i]) * (ys[i + 1] + ys[i])
    return s > 0


def _decimar(xs, ys, tol):
    """Remove vértices a menos de `tol` graus do último mantido (desenho no mapa)."""
    if tol <= 0 or len(xs) < 4:
        return xs, ys
    ox, oy = [xs[0]], [ys[0]]
    for i in range(1, len(xs) - 1):
        if abs(xs[i] - ox[-1]) > tol or abs(ys[i] - oy[-1]) > tol:
            ox.append(xs[i])
            oy.append(ys[i])
    ox.append(xs[-1])
    oy.append(ys[-1])
    if len(ox) < (4 if xs[0] == xs[-1] and ys[0] == ys[-1] else 2):
        return xs, ys
    return ox, oy


class Base:
    """Base de uma fonte numa UF: dados/<fonte>_<uf>/base.shp|shx|dbf (+cpg) + indice.bin + meta.json"""

    def __init__(self, pasta):
        self.pasta = pasta
        with open(os.path.join(pasta, "meta.json"), encoding="utf-8") as f:
            self.meta = json.load(f)
        self._fs = open(os.path.join(pasta, "base.shp"), "rb")
        self.shp = mmap.mmap(self._fs.fileno(), 0, access=mmap.ACCESS_READ)
        self._fd = open(os.path.join(pasta, "base.dbf"), "rb")
        self.dbf = mmap.mmap(self._fd.fileno(), 0, access=mmap.ACCESS_READ)
        self.cod = "utf-8"
        cpg = os.path.join(pasta, "base.cpg")
        if os.path.exists(cpg):
            with open(cpg, encoding="ascii", errors="ignore") as f:
                c = f.read().strip().lower()
            self.cod = {"88591": "latin-1", "8859_1": "latin-1", "iso-8859-1": "latin-1", "1252": "cp1252", "ansi 1252": "cp1252"}.get(c, c or "utf-8")
        self._ler_dbf_cabecalho()
        self._carregar_indice()

    def fechar(self):
        for o in (self.shp, self.dbf, self._fs, self._fd):
            try:
                o.close()
            except Exception:  # noqa: BLE001
                pass

    # --- DBF ---
    def _ler_dbf_cabecalho(self):
        d = self.dbf
        self.n_dbf = struct.unpack_from("<I", d, 4)[0]
        self.hlen, self.rlen = struct.unpack_from("<HH", d, 8)
        self.campos = []
        pos, desloc = 32, 1
        while pos + 32 <= self.hlen and d[pos] != 0x0D:
            nome = bytes(d[pos:pos + 11]).split(b"\x00")[0].decode("latin-1").strip()
            tipo = chr(d[pos + 11])
            tam, dec = d[pos + 16], d[pos + 17]
            self.campos.append((nome, tipo, tam, dec, desloc))
            desloc += tam
            pos += 32

    def atributos(self, i):
        if i >= self.n_dbf:
            return {}
        base = self.hlen + i * self.rlen
        rec = self.dbf[base:base + self.rlen]
        out = {}
        for nome, tipo, tam, dec, desloc in self.campos:
            bruto = rec[desloc:desloc + tam]
            try:
                txt = bruto.decode(self.cod)
            except UnicodeDecodeError:
                txt = bruto.decode("latin-1")
            txt = txt.strip().strip("\x00")
            if not txt:
                continue
            if tipo in "NF":
                try:
                    v = float(txt)
                    out[nome] = int(v) if dec == 0 and v.is_integer() and abs(v) < 2 ** 53 else v
                except ValueError:
                    out[nome] = txt
            elif tipo == "D" and len(txt) == 8 and txt.isdigit():
                out[nome] = f"{txt[6:8]}/{txt[4:6]}/{txt[0:4]}"
            else:
                out[nome] = txt
        return out

    # --- índice ---
    def _carregar_indice(self):
        caminho = os.path.join(self.pasta, "indice.bin")
        with open(caminho, "rb") as f:
            n = struct.unpack("<q", f.read(8))[0]
            self.bb = array.array("d")
            self.bb.fromfile(f, 4 * n)
            self.off = array.array("q")
            self.off.fromfile(f, n)
        self.n = n
        grade, grandes = {}, []
        for i in range(n):
            x0, y0, x1, y1 = self.bb[4 * i:4 * i + 4]
            if not (x1 >= x0 and y1 >= y0):
                continue
            cx0, cx1 = math.floor(x0 / CELULA), math.floor(x1 / CELULA)
            cy0, cy1 = math.floor(y0 / CELULA), math.floor(y1 / CELULA)
            if (cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 64:
                grandes.append(i)
                continue
            for cx in range(cx0, cx1 + 1):
                for cy in range(cy0, cy1 + 1):
                    grade.setdefault((cx, cy), []).append(i)
        self.grade, self.grandes = grade, grandes

    def candidatos(self, x0, y0, x1, y1):
        vistos = set(self.grandes)
        for cx in range(math.floor(x0 / CELULA), math.floor(x1 / CELULA) + 1):
            for cy in range(math.floor(y0 / CELULA), math.floor(y1 / CELULA) + 1):
                vistos.update(self.grade.get((cx, cy), ()))
        for i in sorted(vistos):
            a0, b0, a1, b1 = self.bb[4 * i:4 * i + 4]
            if a0 <= x1 and a1 >= x0 and b0 <= y1 and b1 >= y0:
                yield i

    # --- geometria ---
    def geometria(self, i, tol=0.0):
        o = self.off[i]
        tipo = struct.unpack_from("<i", self.shp, o + 8)[0]
        if tipo in (1, 11, 21):
            x, y = struct.unpack_from("<2d", self.shp, o + 12)
            return {"type": "Point", "coordinates": [round(x, 7), round(y, 7)]}
        if tipo in (3, 13, 23):
            nparts, npts = struct.unpack_from("<ii", self.shp, o + 44)
            partes = list(struct.unpack_from(f"<{nparts}i", self.shp, o + 52)) + [npts]
            coords = struct.unpack_from(f"<{2 * npts}d", self.shp, o + 52 + 4 * nparts)
            linhas = []
            for k in range(nparts):
                a, b = partes[k], partes[k + 1]
                xs, ys = _decimar(list(coords[2 * a:2 * b:2]), list(coords[2 * a + 1:2 * b:2]), tol)
                if len(xs) >= 2:
                    linhas.append([[round(x, 7), round(y, 7)] for x, y in zip(xs, ys)])
            if not linhas:
                return None
            return {"type": "LineString", "coordinates": linhas[0]} if len(linhas) == 1 else {"type": "MultiLineString", "coordinates": linhas}
        if tipo not in (5, 15, 25):
            return None
        nparts, npts = struct.unpack_from("<ii", self.shp, o + 44)
        partes = list(struct.unpack_from(f"<{nparts}i", self.shp, o + 52)) + [npts]
        p0 = o + 52 + 4 * nparts
        coords = struct.unpack_from(f"<{2 * npts}d", self.shp, p0)
        polys = []
        for k in range(nparts):
            a, b = partes[k], partes[k + 1]
            xs, ys = coords[2 * a:2 * b:2], coords[2 * a + 1:2 * b:2]
            if len(xs) < 4:
                continue
            externo = _horario(xs, ys)
            xs, ys = _decimar(list(xs), list(ys), tol)
            anel = [[round(x, 7), round(y, 7)] for x, y in zip(xs, ys)]
            if externo or not polys:
                polys.append([anel])
            else:
                polys[-1].append(anel)
        if not polys:
            return None
        return {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}

    def consultar(self, bbox, maximo=500, tol=0.0):
        feats, total = [], 0
        for i in self.candidatos(*bbox):
            total += 1
            if len(feats) >= maximo:
                continue
            g = self.geometria(i, tol)
            if g:
                feats.append({"type": "Feature", "properties": self.atributos(i), "geometry": g})
        fc = {"type": "FeatureCollection", "features": feats, "total": total}
        if total > len(feats):
            fc["_truncado"] = True
            fc["_aviso"] = f"mostrando {len(feats)} de {total} — aproxime o mapa"
        return fc


def indexar(pasta):
    """Lê .shx e as caixas de cada registro do .shp; grava indice.bin. Retorna (n, tipo)."""
    with open(os.path.join(pasta, "base.shx"), "rb") as f:
        shx = f.read()
    if struct.unpack_from(">i", shx, 0)[0] != 9994:
        raise ErroBase("arquivo .shx inválido")
    tipo = struct.unpack_from("<i", shx, 32)[0]
    if tipo not in TIPOS_SHP:
        raise ErroBase(f"tipo de shapefile não suportado ({tipo})")
    n = (len(shx) - 100) // 8
    bb, off = array.array("d"), array.array("q")
    with open(os.path.join(pasta, "base.shp"), "rb") as fs:
        m = mmap.mmap(fs.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            for k in range(n):
                o = struct.unpack_from(">i", shx, 100 + 8 * k)[0] * 2
                t = struct.unpack_from("<i", m, o + 8)[0] if o + 12 <= len(m) else 0
                if t in (3, 13, 23, 5, 15, 25):
                    bb.extend(struct.unpack_from("<4d", m, o + 12))
                elif t in (1, 11, 21):
                    x, y = struct.unpack_from("<2d", m, o + 12)
                    bb.extend((x, y, x, y))
                else:
                    bb.extend((1.0, 1.0, -1.0, -1.0))  # registro nulo: nunca casa
                off.append(o)
        finally:
            m.close()
    with open(os.path.join(pasta, "indice.bin"), "wb") as f:
        f.write(struct.pack("<q", n))
        bb.tofile(f)
        off.tofile(f)
    return n, tipo


# ============================================================================
# Gerência das bases por UF
# ============================================================================
ABERTAS, TAREFAS = {}, {}
TRAVA = threading.Lock()


def pasta_base(fonte, uf):
    return os.path.join(DADOS, f"{fonte}_{uf.lower()}")


def abrir_base(fonte, uf):
    with TRAVA:
        k = (fonte, uf)
        if k not in ABERTAS:
            p = pasta_base(fonte, uf)
            if not os.path.exists(os.path.join(p, "meta.json")):
                return None
            ABERTAS[k] = Base(p)
        return ABERTAS[k]


def fechar_base(fonte, uf):
    with TRAVA:
        b = ABERTAS.pop((fonte, uf), None)
    if b:
        b.fechar()


def meta_base(fonte, uf):
    p = os.path.join(pasta_base(fonte, uf), "meta.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def listar_bases():
    out = []
    if os.path.isdir(DADOS):
        for nome in sorted(os.listdir(DADOS)):
            m = meta_base(*nome.split("_", 1)) if "_" in nome and not nome.startswith(("_", "bdgd_")) else None
            if m:
                out.append(m)
    return out


def _extrair_shapefile(zip_caminho, destino, profundidade=0):
    """Extrai o maior shapefile de polígonos do .zip (inclusive dentro de outro .zip) para destino/base.*"""
    with zipfile.ZipFile(zip_caminho) as z:
        nomes = z.namelist()
        shps = [n for n in nomes if n.lower().endswith(".shp") and not os.path.basename(n).startswith(".")]
        if not shps:
            internos = [n for n in nomes if n.lower().endswith(".zip")]
            if internos and profundidade < 2:
                tmp = os.path.join(destino, "_interno.zip")
                with z.open(max(internos, key=lambda n: z.getinfo(n).file_size)) as src, open(tmp, "wb") as dst:
                    shutil.copyfileobj(src, dst, 1 << 20)
                try:
                    return _extrair_shapefile(tmp, destino, profundidade + 1)
                finally:
                    os.remove(tmp)
            raise ErroBase("o .zip não contém shapefile (.shp)")
        shp = max(shps, key=lambda n: z.getinfo(n).file_size)
        raiz = shp[:-4]
        mapa = {}
        for ext in ("shp", "shx", "dbf", "cpg", "prj"):
            alvo = next((n for n in nomes if n.lower() == (raiz + "." + ext).lower()), None)
            if alvo:
                mapa[ext] = alvo
        falta = [e for e in ("shp", "shx", "dbf") if e not in mapa]
        if falta:
            raise ErroBase("shapefile incompleto: falta " + ", ".join("." + e for e in falta))
        for ext, membro in mapa.items():  # nomes fixos: nada do .zip escolhe caminho no disco
            with z.open(membro) as src, open(os.path.join(destino, "base." + ext), "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
        return os.path.basename(shp)


def instalar_zip(zip_caminho, fonte, uf, origem):
    os.makedirs(DADOS, exist_ok=True)
    final = pasta_base(fonte, uf)
    nova = final + ".nova"
    shutil.rmtree(nova, ignore_errors=True)
    os.makedirs(nova)
    try:
        arquivo = _extrair_shapefile(zip_caminho, nova)
        n, tipo = indexar(nova)
        with open(os.path.join(nova, "base.dbf"), "rb") as f:
            cab = f.read(32)
        registros = struct.unpack_from("<I", cab, 4)[0]
        prj = ""
        if os.path.exists(os.path.join(nova, "base.prj")):
            with open(os.path.join(nova, "base.prj"), encoding="latin-1") as f:
                prj = f.read()
        if "PROJCS" in prj.upper():
            raise ErroBase("o shapefile está em coordenadas projetadas (UTM); use a versão em coordenadas geográficas (SIRGAS 2000)")
        meta = {"fonte": fonte, "uf": uf, "nome": FONTES_BASE[fonte]["nome"], "origem": origem, "arquivo": arquivo,
                "registros": registros, "geometrias": n, "tipo_shp": tipo,
                "atualizado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"), "datum": "SIRGAS 2000" if "SIRGAS" in prj.upper() else (prj[:60] or "não informado")}
        with open(os.path.join(nova, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
    except Exception:
        shutil.rmtree(nova, ignore_errors=True)
        raise
    fechar_base(fonte, uf)
    velha = final + ".velha"
    shutil.rmtree(velha, ignore_errors=True)
    if os.path.exists(final):
        os.replace(final, velha)
    os.replace(nova, final)
    shutil.rmtree(velha, ignore_errors=True)
    return meta


def tarefa_baixar(fonte, uf):
    est = TAREFAS[(fonte, uf)]
    os.makedirs(DADOS, exist_ok=True)
    tmp = os.path.join(DADOS, f"_baixando_{fonte}_{uf.lower()}.zip")
    erros = []
    try:
        for modelo in FONTES_BASE[fonte]["urls"]:
            url = modelo.format(uf=uf)
            est.update(mensagem="conectando ao INCRA…", url=url, baixados=0, total=0)
            try:
                with abrir_url(url, timeout=90) as r, open(tmp, "wb") as f:
                    est["total"] = int(r.headers.get("Content-Length") or 0)
                    est["mensagem"] = "baixando do INCRA…"
                    primeiro = True
                    while True:
                        bloco = r.read(1 << 16)
                        if not bloco:
                            break
                        if primeiro:
                            primeiro = False
                            if not bloco.startswith(b"PK"):
                                raise ErroBase("o INCRA devolveu uma página em vez do arquivo (pode estar exigindo login gov.br)")
                        f.write(bloco)
                        est["baixados"] += len(bloco)
            except urllib.error.HTTPError as e:
                erros.append(f"HTTP {e.code} em {url}")
                continue
            except (ErroBase, ConnectionError, OSError) as e:
                erros.append(str(e))
                continue
            est["mensagem"] = "indexando…"
            meta = instalar_zip(tmp, fonte, uf, "download INCRA")
            est.update(baixando=False, mensagem=f"concluído: {meta['registros']} registros", erro=None)
            log(f"  base {fonte.upper()} {uf} instalada ({meta['registros']} registros)")
            return
        unicos = list(dict.fromkeys(erros))
        if all("não existe na internet" in e for e in unicos):
            raise ErroBase("o INCRA tirou do ar o endereço de download (certificacao.incra.gov.br não existe mais na internet; "
                           "o Acervo Fundiário também saiu). Não é problema no seu computador. Tente de novo mais tarde — "
                           "ou, se conseguir o shapefile da UF por outro caminho, use “Importar .zip”.")
        raise ErroBase("não foi possível baixar do INCRA — " + "; ".join(unicos[-2:]) + ". Se o problema continuar, baixe o shapefile da UF por outro caminho e use “Importar .zip”.")
    except Exception as e:  # noqa: BLE001 — vira mensagem na interface
        est.update(baixando=False, erro=str(e), mensagem="falhou")
        log(f"  base {fonte.upper()} {uf}: {e}")
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


# ============================================================================
# BDGD (ANEEL) — rede de distribuição de qualquer distribuidora
#   A ANEEL publica a Base de Dados Geográfica da Distribuidora (BDGD) de cada empresa como File Geodatabase
#   no ArcGIS Online (dono "aneel_aneel"). Aqui: listar as distribuidoras, baixar a base mais recente,
#   ler SSDMT (segmentos de média tensão), SUB (subestações de distribuição) e UNTRMT (transformadores de MT)
#   e gravar como bases indexadas, consultáveis por retângulo como as do INCRA.
#   A leitura do .gdb usa o pacote pyogrio (GDAL), instalado sob demanda pelo botão "Instalar leitor".
# ============================================================================
BDGD_DONO = "aneel_aneel"
BDGD_CAMADAS = {
    # campos conferidos numa BDGD real (V11, referência 2025-12-31); os que faltarem numa base são ignorados
    "ssdmt": ("SSDMT", "Segmentos de média tensão", ["COD_ID", "CTMT", "SUB", "FAS_CON", "COMP", "ARE_LOC", "TIP_CND", "POS", "CONJ", "DIST"]),
    "sub": ("SUB", "Subestações de distribuição", ["COD_ID", "NOME", "POS", "DIST"]),
    "untrmt": ("UNTRMT", "Transformadores de média tensão", ["COD_ID", "CTMT", "SUB", "POT_NOM", "FAS_CON", "FAS_CON_P", "FAS_CON_S", "TIP_TRAFO", "SIT_ATIV", "ARE_LOC", "MUN", "DIST"]),
}
RE_TITULO = re.compile(r"^(?P<nome>.+?)_(?P<cod>\d+)_(?P<data>\d{4}-\d{2}-\d{2})_(?P<ver>[VM]\d+)_(?P<pub>\d{8}-\d{4})$")


def _pyogrio():
    try:
        import pyogrio  # noqa: F401
        return pyogrio
    except Exception:  # noqa: BLE001
        try:
            import site
            caminho = site.getusersitepackages()
            if caminho not in sys.path:
                sys.path.append(caminho)
            importlib.invalidate_caches()
            import pyogrio  # noqa: F401,F811
            return pyogrio
        except Exception:  # noqa: BLE001
            return None


def tarefa_instalar_leitor():
    est = TAREFAS[("bdgd", "leitor")]
    try:
        cmd = [sys.executable, "-m", "pip", "install", "--user", "--disable-pip-version-check", "--no-input", "pyogrio"]
        est["mensagem"] = "instalando pyogrio (GDAL) — pode levar alguns minutos…"
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if r.returncode != 0:
            raise ErroBase("pip falhou: " + (r.stderr or r.stdout)[-400:])
        if not _pyogrio():
            raise ErroBase("pyogrio instalado, mas não carregou; feche e abra o iniciar.bat de novo")
        est.update(baixando=False, mensagem="leitor instalado", erro=None)
    except Exception as e:  # noqa: BLE001
        est.update(baixando=False, mensagem="falhou", erro=str(e))


def _json_url(url, timeout=60):
    with abrir_url(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def bdgd_distribuidoras(forcar=False):
    """Base mais recente de cada distribuidora (cache de 24 h em dados/bdgd_catalogo.json)."""
    os.makedirs(DADOS, exist_ok=True)
    cache = os.path.join(DADOS, "bdgd_catalogo_v2.json")
    if not forcar and os.path.exists(cache) and time.time() - os.path.getmtime(cache) < 86400:
        with open(cache, encoding="utf-8") as f:
            return json.load(f)
    itens, inicio = [], 1
    while inicio > 0 and len(itens) < 5000:
        q = urllib.parse.urlencode({"q": f'owner:{BDGD_DONO} type:"File Geodatabase"', "num": 100, "start": inicio, "f": "json", "sortField": "title"})
        j = _json_url("https://www.arcgis.com/sharing/rest/search?" + q)
        itens += j.get("results", [])
        inicio = j.get("nextStart", -1)
    melhores = {}
    for it in itens:
        m = RE_TITULO.match(it.get("title", ""))
        if not m:
            continue
        # a chave é o código do agente na ANEEL: a mesma distribuidora aparece com nomes antigos (EPB → Energisa_PB, COELBA → Neoenergia_Coelba)
        chave = m["cod"]
        reg = {"id": it["id"], "titulo": it["title"], "nome": m["nome"].replace("_", " "), "codigo": m["cod"], "data": m["data"], "publicado": m["pub"], "tamanho": max(0, int(it.get("size") or 0))}
        atual = melhores.get(chave)
        if not atual or (reg["data"], reg["publicado"]) > (atual["data"], atual["publicado"]):
            melhores[chave] = reg
    lista = sorted(melhores.values(), key=lambda r: r["nome"].lower())
    ultimo = max((r["data"][:4] for r in lista), default="0000")
    for r in lista:  # base sem atualização recente: em geral distribuidora incorporada por outra
        r["antiga"] = r["data"][:4] < str(int(ultimo) - 1)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(lista, f, ensure_ascii=False)
    return lista


def _wkb_partes(b):
    """WKB → (tipo, partes). tipo: 'P' ponto, 'L' linha, 'A' área (partes = anéis, com marcação de polígono)."""
    out, tipo = [], None
    pos = 0

    def ler(pos):
        nonlocal tipo
        ordem = "<" if b[pos] == 1 else ">"
        t = struct.unpack_from(ordem + "I", b, pos + 1)[0]
        pos += 5
        dim = 2
        if t & 0x80000000:
            dim += 1
        if t & 0x40000000:
            dim += 1
        if t & 0x20000000:  # EWKB com SRID
            pos += 4
        t &= 0x0FFFFFFF
        base = t % 1000
        if t >= 3000:
            dim = 4
        elif t >= 1000:
            dim = max(dim, 3)
        if base == 1:
            x, y = struct.unpack_from(ordem + "2d", b, pos)
            tipo = tipo or "P"
            out.append(("P", [(x, y)]))
            return pos + 8 * dim
        if base == 2:
            n = struct.unpack_from(ordem + "I", b, pos)[0]
            pos += 4
            v = struct.unpack_from(ordem + f"{n * dim}d", b, pos)
            tipo = tipo or "L"
            out.append(("L", [(v[k], v[k + 1]) for k in range(0, n * dim, dim)]))
            return pos + 8 * n * dim
        if base == 3:
            nr = struct.unpack_from(ordem + "I", b, pos)[0]
            pos += 4
            for r in range(nr):
                n = struct.unpack_from(ordem + "I", b, pos)[0]
                pos += 4
                v = struct.unpack_from(ordem + f"{n * dim}d", b, pos)
                out.append(("E" if r == 0 else "I", [(v[k], v[k + 1]) for k in range(0, n * dim, dim)]))
                pos += 8 * n * dim
            tipo = tipo or "A"
            return pos
        if base in (4, 5, 6, 7):
            n = struct.unpack_from(ordem + "I", b, pos)[0]
            pos += 4
            for _ in range(n):
                pos = ler(pos)
            return pos
        raise ErroBase(f"geometria WKB não suportada (tipo {t})")

    ler(0)
    return tipo, out


def _area_assinada(pts):
    s = 0.0
    for i in range(len(pts) - 1):
        s += (pts[i + 1][0] - pts[i][0]) * (pts[i + 1][1] + pts[i][1])
    return s  # > 0: horário


class ShpEscritor:
    """Escreve um shapefile (ponto, linha ou polígono) + DBF em UTF-8, em fluxo."""

    def __init__(self, pasta, tipo, campos):
        os.makedirs(pasta, exist_ok=True)
        self.tipo = tipo
        self.campos = [(c[:10], 80) for c in campos]
        self.shp = open(os.path.join(pasta, "base.shp"), "wb")
        self.shx = open(os.path.join(pasta, "base.shx"), "wb")
        self.dbf = open(os.path.join(pasta, "base.dbf"), "wb")
        with open(os.path.join(pasta, "base.cpg"), "w", encoding="ascii") as f:
            f.write("UTF-8")
        with open(os.path.join(pasta, "base.prj"), "w", encoding="ascii") as f:
            f.write('GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]')
        self.shp.write(b"\0" * 100)
        self.shx.write(b"\0" * 100)
        self.hlen = 32 + 32 * len(self.campos) + 1
        self.rlen = 1 + sum(w for _, w in self.campos)
        self.dbf.write(b"\0" * self.hlen)
        self.n, self.pos = 0, 100
        self.bbox = [math.inf, math.inf, -math.inf, -math.inf]

    def escrever(self, partes, attrs):
        if self.tipo == 1:
            x, y = partes[0][0]
            conteudo = struct.pack("<i2d", 1, x, y)
            bb = (x, y, x, y)
        else:
            pts = [p for parte in partes for p in parte]
            if not pts:
                return
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            bb = (min(xs), min(ys), max(xs), max(ys))
            offs, k = [], 0
            for parte in partes:
                offs.append(k)
                k += len(parte)
            conteudo = struct.pack("<i4d2i", self.tipo, *bb, len(partes), len(pts)) + struct.pack(f"<{len(offs)}i", *offs) + struct.pack(f"<{2 * len(pts)}d", *[c for p in pts for c in p])
        self.n += 1
        self.shp.write(struct.pack(">2i", self.n, len(conteudo) // 2) + conteudo)
        self.shx.write(struct.pack(">2i", self.pos // 2, len(conteudo) // 2))
        self.pos += 8 + len(conteudo)
        self.bbox = [min(self.bbox[0], bb[0]), min(self.bbox[1], bb[1]), max(self.bbox[2], bb[2]), max(self.bbox[3], bb[3])]
        reg = bytearray(b" ")
        for (nome, w), v in zip(self.campos, attrs):
            t = "" if v is None else str(v)
            bt = t.encode("utf-8")[:w].decode("utf-8", "ignore").encode("utf-8")
            reg += bt + b" " * (w - len(bt))
        self.dbf.write(bytes(reg))

    def fechar(self):
        bb = self.bbox if self.n else [0, 0, 0, 0]
        for arq, tam in ((self.shp, self.pos), (self.shx, 100 + 8 * self.n)):
            arq.seek(0)
            arq.write(struct.pack(">i", 9994) + b"\0" * 20 + struct.pack(">i", tam // 2) + struct.pack("<2i", 1000, self.tipo) + struct.pack("<4d", *bb) + b"\0" * 32)
        self.dbf.write(b"\x1a")
        self.dbf.seek(0)
        hoje = datetime.date.today()
        cab = struct.pack("<4BIHH", 3, hoje.year - 1900, hoje.month, hoje.day, self.n, self.hlen, self.rlen) + b"\0" * 20
        for nome, w in self.campos:
            cab += nome.encode("ascii", "replace")[:10].ljust(11, b"\0") + b"C" + b"\0" * 4 + bytes([w, 0]) + b"\0" * 14
        self.dbf.write(cab + b"\r")
        for arq in (self.shp, self.shx, self.dbf):
            arq.close()
        return bb


def _slug(t):
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")[:60]


def pasta_bdgd(slug, camada):
    return os.path.join(DADOS, f"bdgd_{slug}__{camada}")


def bases_bdgd(camada=None):
    out = []
    if os.path.isdir(DADOS):
        for nome in sorted(os.listdir(DADOS)):
            if nome.startswith("bdgd_") and "__" in nome and not nome.endswith((".nova", ".velha")):
                p = os.path.join(DADOS, nome, "meta.json")
                if os.path.exists(p):
                    try:
                        with open(p, encoding="utf-8") as f:
                            m = json.load(f)
                    except (OSError, ValueError):
                        continue
                    if not all(k in m for k in ("camada", "slug", "distribuidora", "bounds")):
                        continue
                    if not camada or m.get("camada") == camada:
                        m["pasta"] = os.path.join(DADOS, nome)
                        out.append(m)
    return out


def abrir_pasta(pasta):
    with TRAVA:
        k = ("pasta", pasta)
        if k not in ABERTAS:
            ABERTAS[k] = Base(pasta)
        return ABERTAS[k]


def fechar_pasta(pasta):
    with TRAVA:
        b = ABERTAS.pop(("pasta", pasta), None)
    if b:
        b.fechar()


def tarefa_bdgd(item_id, local=None, nome_arquivo=None):
    """Baixa (item do ArcGIS Online) ou usa um .zip importado (local) e instala SSDMT/SUB/UNTRMT."""
    est = TAREFAS[("bdgd", item_id)]
    os.makedirs(DADOS, exist_ok=True)
    zipp = local or os.path.join(DADOS, f"_bdgd_{item_id}.zip")
    try:
        pg = _pyogrio()
        if not pg:
            raise ErroBase("falta o leitor de GDB: clique em “Instalar leitor” no painel da BDGD")
        if local:
            titulo = re.sub(r"\.(gdb\.)?zip$", "", os.path.basename(nome_arquivo or "BDGD"), flags=re.I)
            info, tamanho = {}, 0
        else:
            info = _json_url(f"https://www.arcgis.com/sharing/rest/content/items/{item_id}?f=json")
            if info.get("owner") != BDGD_DONO or info.get("type") != "File Geodatabase":
                raise ErroBase("o item não é uma BDGD publicada pela ANEEL")
            titulo = info.get("title", item_id)
            tamanho = max(0, int(info.get("size") or 0))
        m = RE_TITULO.match(titulo)
        nome = m["nome"].replace("_", " ") if m else titulo
        slug = f"ag{m['cod']}" if m else (_slug(titulo)[:60] or "importada")  # pelo código do agente: nova versão (ou nome novo) substitui a anterior
        if not local and not (os.path.exists(zipp) and tamanho and os.path.getsize(zipp) == tamanho):
            est.update(mensagem=f"baixando a BDGD da {nome}…", total=tamanho, baixados=0)
            with abrir_url(f"https://www.arcgis.com/sharing/rest/content/items/{item_id}/data", timeout=120) as r, open(zipp, "wb") as f:
                est["total"] = max(0, int(r.headers.get("Content-Length") or tamanho or 0))
                while True:
                    bloco = r.read(1 << 20)
                    if not bloco:
                        break
                    f.write(bloco)
                    est["baixados"] += len(bloco)
        if not zipfile.is_zipfile(zipp):
            raise ErroBase("o arquivo baixado não é um .zip válido")
        with zipfile.ZipFile(zipp) as z:
            gdbs = sorted({n.split(".gdb/")[0] + ".gdb" for n in z.namelist() if ".gdb/" in n})
        if not gdbs:
            raise ErroBase("o .zip não contém um File Geodatabase (.gdb)")
        gdb = "/vsizip/" + os.path.abspath(zipp).replace("\\", "/") + "/" + gdbs[0]
        camadas = {str(n).upper(): str(n) for n, _ in pg.list_layers(gdb)}
        ctmt = {}
        if "CTMT" in camadas:
            est["mensagem"] = "lendo os circuitos (CTMT)…"
            cols = [c for c in ("COD_ID", "NOME", "SUB", "TEN_NOM", "TEN_OPE") if c in pg.read_info(gdb, layer=camadas["CTMT"])["fields"]]
            meta_c, _, _, dados = pg.raw.read(gdb, layer=camadas["CTMT"], read_geometry=False, columns=cols)
            nomes_c = [str(n) for n in meta_c["fields"]]
            col = {n: dados[j] for j, n in enumerate(nomes_c)}
            for k in range(len(col.get("COD_ID", []))):
                ctmt[str(col["COD_ID"][k])] = {n: col[n][k] for n in nomes_c}
        feitas = []
        for chave, (nome_camada, desc, campos_pref) in BDGD_CAMADAS.items():
            if nome_camada not in camadas:
                continue
            lay = camadas[nome_camada]
            meta_l = pg.read_info(gdb, layer=lay)
            crs = str(meta_l.get("crs") or "")
            if crs and not re.search(r"4674|4326|4618|4989|SIRGAS 2000|WGS 84", crs, re.I):
                raise ErroBase(f"{nome_camada} está em coordenadas projetadas ({crs}); conversão não suportada nesta versão")
            campos = [c for c in campos_pref if c in meta_l["fields"]]
            extras_ctmt = [x for x in ("CIRCUITO", "TEN_NOM", "TEN_OPE", "SUB") if x not in campos] if chave in ("ssdmt", "untrmt") and ctmt else []
            total = int(meta_l.get("features") or 0)
            tipo_g = str(meta_l.get("geometry_type") or "").upper()
            tipo_shp = 1 if "POINT" in tipo_g else 3 if "LINE" in tipo_g or "CURVE" in tipo_g else 5
            nova = pasta_bdgd(slug, chave) + ".nova"
            shutil.rmtree(nova, ignore_errors=True)
            esc = ShpEscritor(nova, tipo_shp, campos + extras_ctmt)
            ignorados, lote = 0, 50000
            for ini in range(0, max(total, 1), lote):
                est["mensagem"] = f"{desc}: {min(ini, total):,} de {total:,}".replace(",", ".")
                meta_r, _, geoms, dados = pg.raw.read(gdb, layer=lay, columns=campos, skip_features=ini, max_features=lote, force_2d=True)
                pos_col = {str(n): j for j, n in enumerate(meta_r["fields"])}
                ordem = [pos_col.get(c) for c in campos]
                for k, wkb in enumerate(geoms):
                    if wkb is None:
                        ignorados += 1
                        continue
                    try:
                        tipo, partes = _wkb_partes(bytes(wkb))
                    except Exception:  # noqa: BLE001
                        ignorados += 1
                        continue
                    if tipo_shp == 1:
                        pts = [p for t, p in partes if t == "P"]
                        if not pts:
                            ignorados += 1
                            continue
                        geo = [pts[0]]
                    elif tipo_shp == 3:
                        geo = [p for t, p in partes if t == "L" and len(p) >= 2]
                    else:
                        geo = []
                        for t, p in partes:
                            if len(p) < 4:
                                continue
                            horario = _area_assinada(p) > 0
                            geo.append(p if horario == (t == "E") else p[::-1])
                    if not geo:
                        ignorados += 1
                        continue
                    vals = [dados[j][k] if j is not None else None for j in ordem]
                    if extras_ctmt:
                        c = ctmt.get(str(vals[campos.index("CTMT")]) if "CTMT" in campos else "", {})
                        de = {"CIRCUITO": "NOME", "TEN_NOM": "TEN_NOM", "TEN_OPE": "TEN_OPE", "SUB": "SUB"}
                        vals += [c.get(de[x]) for x in extras_ctmt]
                    esc.escrever(geo, ["" if v is None or (isinstance(v, float) and math.isnan(v)) else (round(float(v), 3) if hasattr(v, "dtype") and v.dtype.kind == "f" or isinstance(v, float) else v) for v in vals])
            bb = esc.fechar()
            n, _ = indexar(nova)
            meta = {"fonte": "bdgd", "camada": chave, "descricao": desc, "distribuidora": nome, "slug": slug, "codigo": m["cod"] if m else "",
                    "data_referencia": m["data"] if m else "", "item": "" if local else item_id, "titulo": titulo, "registros": n, "ignorados": ignorados,
                    "bounds": bb, "atualizado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
                    "origem": "BDGD ANEEL — arquivo importado" if local else "BDGD ANEEL (ArcGIS Online)"}
            with open(os.path.join(nova, "meta.json"), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=1)
            final = pasta_bdgd(slug, chave)
            fechar_pasta(final)
            shutil.rmtree(final + ".velha", ignore_errors=True)
            if os.path.exists(final):
                os.replace(final, final + ".velha")
            os.replace(nova, final)
            shutil.rmtree(final + ".velha", ignore_errors=True)
            feitas.append(f"{desc}: {n:,}".replace(",", "."))
        if not feitas:
            raise ErroBase("a BDGD não tem as camadas SSDMT/SUB/UNTRMT")
        est.update(baixando=False, mensagem="instalada — " + "; ".join(feitas), erro=None)
        log(f"  BDGD {nome} instalada ({'; '.join(feitas)})")
        try:
            os.remove(zipp)
        except OSError:
            pass
    except Exception as e:  # noqa: BLE001
        est.update(baixando=False, erro=str(e), mensagem="falhou")
        log(f"  BDGD {item_id}: {e}")
        if local:
            try:
                os.remove(zipp)
            except OSError:
                pass


def bdgd_consulta(camada, bbox, maximo, tol):
    bases = [b for b in bases_bdgd(camada) if not (bbox[2] < b["bounds"][0] or bbox[0] > b["bounds"][2] or bbox[3] < b["bounds"][1] or bbox[1] > b["bounds"][3])]
    if not bases_bdgd(camada):
        return None
    feats, total, aviso = [], 0, None
    for m in bases:
        fc = abrir_pasta(m["pasta"]).consultar(bbox, max(0, maximo - len(feats)), tol)
        for f in fc["features"]:
            f["properties"]["DISTRIBUIDORA"] = m["distribuidora"]
            f["properties"]["REF_BDGD"] = m["data_referencia"]
        feats += fc["features"]
        total += fc["total"]
    out = {"type": "FeatureCollection", "features": feats, "total": total, "distribuidoras": [m["distribuidora"] for m in bases]}
    if total > len(feats):
        out["_truncado"] = True
        out["_aviso"] = f"mostrando {len(feats)} de {total} — aproxime o mapa"
    if not bases:
        out["_aviso"] = "nenhuma BDGD instalada cobre esta região"
    return out


# ============================================================================
# HTTP
# ============================================================================
class Manipulador(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json",
        ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".html": "text/html", ".md": "text/markdown",
    })

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def log_request(self, code="-", size="-"):
        try:
            c = int(code)
        except (TypeError, ValueError):
            c = 0
        if c >= 400:
            sys.stderr.write(f"  {c} {self.command} {self.path[:160]}\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        origem = self.headers.get("Origin")
        if origem and (origem == "null" or origem.startswith(("http://localhost", "http://127.0.0.1"))):
            self.send_header("Access-Control-Allow-Origin", origem)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def _json(self, status, obj):
        corpo = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _params(self, partes):
        q = urllib.parse.parse_qs(partes.query)
        fonte = q.get("fonte", [""])[0].lower()
        uf = q.get("uf", [""])[0].upper()
        if fonte not in FONTES_BASE or uf not in UFS:
            raise ValueError("fonte ou UF inválida")
        return q, fonte, uf

    def do_GET(self):
        partes = urllib.parse.urlsplit(self.path)
        try:
            if partes.path == "/api/status":
                return self._json(200, {"app": "vip-analysis", "versao": VERSAO, "raiz": RAIZ, "dados": DADOS, "permitidos": sorted(PERMITIDOS), "bases": listar_bases()})
            if partes.path == "/proxy":
                return self._proxy(partes.query)
            if partes.path == "/api/bases":
                return self._json(200, {"bases": listar_bases()})
            if partes.path == "/api/bases/estado":
                _, fonte, uf = self._params(partes)
                m = meta_base(fonte, uf) or {}
                t = dict(TAREFAS.get((fonte, uf), {}))
                return self._json(200, dict(m, fonte=fonte, uf=uf, existe=bool(m), **t))
            if partes.path == "/api/bases/consulta":
                q, fonte, uf = self._params(partes)
                bbox = [float(v) for v in q.get("bbox", [""])[0].split(",")]
                if len(bbox) != 4:
                    raise ValueError("bbox inválido")
                maximo = max(1, min(5000, int(q.get("max", ["500"])[0])))
                tol = max(0.0, min(0.01, float(q.get("tol", ["0"])[0])))
                b = abrir_base(fonte, uf)
                if not b:
                    return self._json(404, {"codigo": "sem_base", "erro": f"a base {fonte.upper()} de {uf} ainda não foi baixada/importada (Camadas › Bases do INCRA)"})
                return self._json(200, b.consultar(bbox, maximo, tol))
            if partes.path == "/api/bdgd/estado":
                tarefas = {k[1]: dict(v) for k, v in TAREFAS.items() if k[0] == "bdgd"}
                grupos = {}
                for m in bases_bdgd():
                    g = grupos.setdefault(m["slug"], {"slug": m["slug"], "distribuidora": m["distribuidora"], "codigo": m.get("codigo", ""), "data_referencia": m["data_referencia"], "item": m["item"], "atualizado_em": m["atualizado_em"], "camadas": {}})
                    g["camadas"][m["camada"]] = m["registros"]
                return self._json(200, {"leitor": bool(_pyogrio()), "bases": list(grupos.values()), "tarefas": tarefas})
            if partes.path == "/api/bdgd/distribuidoras":
                forcar = "forcar" in urllib.parse.parse_qs(partes.query)
                return self._json(200, {"distribuidoras": bdgd_distribuidoras(forcar)})
            if partes.path == "/api/bdgd/consulta":
                q = urllib.parse.parse_qs(partes.query)
                camada = q.get("camada", ["ssdmt"])[0]
                if camada not in BDGD_CAMADAS:
                    raise ValueError("camada BDGD inválida")
                bbox = [float(v) for v in q.get("bbox", [""])[0].split(",")]
                if len(bbox) != 4:
                    raise ValueError("bbox inválido")
                maximo = max(1, min(8000, int(q.get("max", ["1500"])[0])))
                tol = max(0.0, min(0.01, float(q.get("tol", ["0"])[0])))
                fc = bdgd_consulta(camada, bbox, maximo, tol)
                if fc is None:
                    return self._json(404, {"codigo": "sem_base", "erro": "nenhuma BDGD instalada — Camadas › Rede de distribuição (BDGD)"})
                return self._json(200, fc)
            if partes.path == "/api/pdf/arquivo":
                nome = os.path.basename(urllib.parse.parse_qs(partes.query).get("nome", [""])[0])
                caminho = os.path.join(RELATORIOS, nome)
                ext = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
                if ext not in TIPOS_ARQUIVO or not os.path.isfile(caminho):
                    return self._json(404, {"erro": "arquivo não encontrado"})
                with open(caminho, "rb") as f:
                    dados = f.read()
                self.send_response(200)
                self.send_header("Content-Type", TIPOS_ARQUIVO[ext])
                self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(nome))
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)
                return
            if partes.path.startswith(("/cache/", "/dados/")):
                return self._json(404, {"erro": "não disponível"})
        except ValueError as e:
            return self._json(400, {"erro": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"erro": f"{type(e).__name__}: {e}"})
        return super().do_GET()

    def do_POST(self):
        partes = urllib.parse.urlsplit(self.path)
        try:
            if partes.path == "/api/pdf":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > 80 * 1024 * 1024:
                    raise ValueError("relatório vazio ou grande demais")
                corpo = json.loads(self.rfile.read(n).decode("utf-8"))
                html = str(corpo.get("html") or "")
                if not html.lstrip().lower().startswith("<!doctype html"):
                    raise ValueError("conteúdo inválido")
                caminho = gerar_pdf(html, str(corpo.get("nome") or "Relatório VIP ANALYSIS"))
                aberto = abrir_arquivo(caminho) if corpo.get("abrir", True) else False
                return self._json(200, {"ok": True, "arquivo": caminho, "pasta": RELATORIOS, "aberto": aberto,
                                        "url": "/api/pdf/arquivo?nome=" + urllib.parse.quote(os.path.basename(caminho))})
            if partes.path == "/api/arquivo":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > 120 * 1024 * 1024:
                    raise ValueError("arquivo vazio ou grande demais")
                corpo = json.loads(self.rfile.read(n).decode("utf-8"))
                caminho = salvar_arquivo(str(corpo.get("base64") or ""), str(corpo.get("nome") or "Apresentação VIP ANALYSIS"), str(corpo.get("ext") or "").lower())
                aberto = abrir_arquivo(caminho) if corpo.get("abrir", True) else False
                return self._json(200, {"ok": True, "arquivo": caminho, "pasta": RELATORIOS, "aberto": aberto,
                                        "url": "/api/pdf/arquivo?nome=" + urllib.parse.quote(os.path.basename(caminho))})
            if partes.path == "/api/bases/baixar":
                _, fonte, uf = self._params(partes)
                with TRAVA:
                    atual = TAREFAS.get((fonte, uf))
                    if atual and atual.get("baixando"):
                        return self._json(200, {"ok": True, "mensagem": "download já em andamento"})
                    TAREFAS[(fonte, uf)] = {"baixando": True, "baixados": 0, "total": 0, "mensagem": "iniciando…", "erro": None}
                threading.Thread(target=tarefa_baixar, args=(fonte, uf), daemon=True).start()
                return self._json(200, {"ok": True, "mensagem": "download iniciado"})
            if partes.path == "/api/bdgd/preparar":
                if _pyogrio():
                    return self._json(200, {"ok": True, "mensagem": "leitor já instalado"})
                with TRAVA:
                    atual = TAREFAS.get(("bdgd", "leitor"))
                    if atual and atual.get("baixando"):
                        return self._json(200, {"ok": True, "mensagem": "instalação em andamento"})
                    TAREFAS[("bdgd", "leitor")] = {"baixando": True, "mensagem": "iniciando…", "erro": None}
                threading.Thread(target=tarefa_instalar_leitor, daemon=True).start()
                return self._json(200, {"ok": True, "mensagem": "instalação iniciada"})
            if partes.path == "/api/bdgd/baixar":
                item = urllib.parse.parse_qs(partes.query).get("item", [""])[0]
                if not re.fullmatch(r"[0-9a-f]{32}", item):
                    raise ValueError("item inválido")
                with TRAVA:
                    atual = TAREFAS.get(("bdgd", item))
                    if atual and atual.get("baixando"):
                        return self._json(200, {"ok": True, "mensagem": "já em andamento"})
                    TAREFAS[("bdgd", item)] = {"baixando": True, "baixados": 0, "total": 0, "mensagem": "iniciando…", "erro": None}
                threading.Thread(target=tarefa_bdgd, args=(item,), daemon=True).start()
                return self._json(200, {"ok": True, "mensagem": "download iniciado"})
            if partes.path == "/api/bdgd/importar":
                if not _pyogrio():
                    raise ValueError("falta o leitor de GDB: clique em “Instalar leitor” no painel da BDGD")
                nome_arq = urllib.parse.parse_qs(partes.query).get("nome", ["BDGD.zip"])[0]
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0:
                    raise ValueError("arquivo vazio")
                if n > LIMITE_UPLOAD:
                    raise ValueError("arquivo maior que 3 GB")
                with TRAVA:
                    atual = TAREFAS.get(("bdgd", "importar"))
                    if atual and atual.get("baixando"):
                        raise ValueError("já há uma importação de BDGD em andamento")
                    TAREFAS[("bdgd", "importar")] = {"baixando": True, "baixados": 0, "total": n, "mensagem": "recebendo o arquivo…", "erro": None}
                os.makedirs(DADOS, exist_ok=True)
                fd, tmp = tempfile.mkstemp(prefix="_bdgd_imp_", suffix=".zip", dir=DADOS)
                with os.fdopen(fd, "wb") as f:
                    resta = n
                    while resta > 0:
                        bloco = self.rfile.read(min(1 << 20, resta))
                        if not bloco:
                            break
                        f.write(bloco)
                        resta -= len(bloco)
                        TAREFAS[("bdgd", "importar")]["baixados"] = n - resta
                if not zipfile.is_zipfile(tmp):
                    os.remove(tmp)
                    TAREFAS[("bdgd", "importar")].update(baixando=False, erro="o arquivo não é um .zip válido", mensagem="falhou")
                    raise ValueError("o arquivo não é um .zip válido (compacte a pasta .gdb em .zip)")
                TAREFAS[("bdgd", "importar")]["mensagem"] = "lendo o File Geodatabase…"
                threading.Thread(target=tarefa_bdgd, args=("importar", tmp, nome_arq), daemon=True).start()
                return self._json(200, {"ok": True, "mensagem": "importação iniciada"})
            if partes.path == "/api/bdgd/remover":
                slug = urllib.parse.parse_qs(partes.query).get("slug", [""])[0]
                if not re.fullmatch(r"[a-z0-9_]{2,60}", slug):
                    raise ValueError("slug inválido")
                for chave in BDGD_CAMADAS:
                    p = pasta_bdgd(slug, chave)
                    fechar_pasta(p)
                    shutil.rmtree(p, ignore_errors=True)
                return self._json(200, {"ok": True})
            if partes.path == "/api/bases/importar":
                _, fonte, uf = self._params(partes)
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0:
                    raise ValueError("arquivo vazio")
                if n > LIMITE_UPLOAD:
                    raise ValueError("arquivo maior que 3 GB")
                os.makedirs(DADOS, exist_ok=True)
                fd, tmp = tempfile.mkstemp(suffix=".zip", dir=DADOS)
                try:
                    with os.fdopen(fd, "wb") as f:
                        resta = n
                        while resta > 0:
                            bloco = self.rfile.read(min(1 << 20, resta))
                            if not bloco:
                                break
                            f.write(bloco)
                            resta -= len(bloco)
                    if not zipfile.is_zipfile(tmp):
                        raise ErroBase("o arquivo enviado não é um .zip válido")
                    meta = instalar_zip(tmp, fonte, uf, "importado")
                finally:
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass
                TAREFAS.pop((fonte, uf), None)
                log(f"  base {fonte.upper()} {uf} importada ({meta['registros']} registros)")
                return self._json(200, dict(meta, ok=True))
        except (ValueError, ErroBase) as e:
            return self._json(400, {"erro": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"erro": f"{type(e).__name__}: {e}"})
        return self._json(404, {"erro": "rota desconhecida"})

    def _proxy(self, query):
        q = urllib.parse.parse_qs(query)
        alvo = q.get("url", [""])[0]
        fresco = q.get("fresco", [""])[0] == "1"
        destino = urllib.parse.urlsplit(alvo)
        if destino.scheme not in ("http", "https") or destino.hostname not in PERMITIDOS:
            return self._json(403, {"erro": f"domínio não permitido pelo proxy: {destino.hostname}"})
        try:
            status, tipo, corpo, origem, idade = buscar(alvo, fresco)
        except Exception as e:  # noqa: BLE001
            return self._json(502, {"erro": f"{type(e).__name__}: {e}"})
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("X-VIP-Origem", origem)
        self.send_header("X-VIP-Idade", str(idade))
        self.send_header("Access-Control-Expose-Headers", "X-VIP-Origem, X-VIP-Idade")
        self.end_headers()
        self.wfile.write(corpo)


def ja_rodando(porta):
    """Devolve o status do servidor que já ocupa a porta (ou None)."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/status", timeout=2) as r:
            j = json.loads(r.read().decode("utf-8"))
            return j if j.get("app") == "vip-analysis" else None
    except Exception:  # noqa: BLE001
        return None


def main():
    porta = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8766
    abrir = "--sem-navegador" not in sys.argv
    url = f"http://localhost:{porta}/"
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", porta), Manipulador)
    except OSError:
        outro = ja_rodando(porta)
        if outro and outro.get("versao") == VERSAO and os.path.realpath(outro.get("raiz") or RAIZ) == os.path.realpath(RAIZ):
            log(f"A VIP ANALYSIS já está rodando em {url} — abrindo o navegador.")
            if abrir:
                webbrowser.open(url)
            return
        if outro:
            log("=" * 64)
            log(f"  Outra janela da VIP ANALYSIS (v{outro.get('versao', '?')}) já está aberta e usando a porta {porta}.")
            log(f"  Pasta dela: {outro.get('raiz', '?')}")
            log("  FECHE a janela preta antiga e abra este iniciar.bat de novo.")
            log("=" * 64)
            sys.exit(1)
        raise
    servidor.daemon_threads = True
    movidas = migrar_bases()
    bases = listar_bases()
    log("=" * 64)
    log(f"  VIP ANALYSIS v{VERSAO}  ·  {url}")
    log(f"  Bases e cache em: {PASTA_USUARIO}")
    if movidas:
        log(f"  Bases trazidas de versões anteriores: {', '.join(movidas)}")
    log("  Mantenha esta janela aberta enquanto usa a plataforma.")
    log("  Para encerrar: feche a janela ou tecle Ctrl+C.")
    if bases:
        log("  Bases do INCRA instaladas: " + ", ".join(f"{b['fonte'].upper()}-{b['uf']}" for b in bases))
    log("=" * 64)
    if abrir:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
