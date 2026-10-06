# Extracción de la fuente normativa

Este directorio contiene la **procedencia del reglamento** que cita el Chatbook.
Responde a la pregunta que un jurado hará tarde o temprano: *¿de dónde salieron
los 43 artículos que el asistente cita textualmente?*

## El pipeline

```
ACUERDO 105 DE 2023 (PDF oficial)
        │
        │  parse_reglamento.py        ← extrae texto, limpia encabezados,
        ▼                               segmenta por capítulos y artículos
reglamento_structured.json           ← 8 capítulos, 43 artículos, literales
        │
        │  build_module_files.py      ← serializa a módulo ES
        ▼
backend/chatbook/regulation/regulation_data.js   ← EN USO (174 KB)
```

La fuente es el **Acuerdo 105 de 2023** del Consejo Académico de la Universidad
CESMAG, en su versión 2, compilada con las modificaciones del **Acuerdo 064 de
2024**. El PDF no está versionado en el repositorio: es un documento
institucional que se obtiene de la Universidad.

## Cómo se ejecuta

```bash
pip install pymupdf

python scripts/reglamento/parse_reglamento.py "ruta/al/ACUERDO 105 DE 2023.pdf"
python scripts/reglamento/build_module_files.py
```

El primer paso regenera `reglamento_structured.json` junto a estos scripts. El
segundo lo convierte en `backend/chatbook/regulation/regulation_data.js`.

> **Cuidado:** `build_module_files.py` **sobrescribe** `regulation_data.js`, que
> está en uso. No lo ejecutes salvo que vayas a regenerar la fuente normativa
> completa —por ejemplo, si la Universidad expide un acuerdo modificatorio.

## Verificación

El 2026-09-15 se regeneró `regulation_data.js` desde el `.json` de este
directorio y el resultado resultó **byte por byte idéntico** al archivo en
producción. El pipeline es reproducible, no documentación decorativa.

## Nota sobre las rutas

Ambos scripts vivían en `scratch/` con rutas codificadas: el PDF apuntaba al
escritorio personal de una de las autoras y el destino era `server/`, una
carpeta que ya no existe. Al trasladarlos aquí se corrigieron —el PDF ahora se
pasa por argumento y las rutas se resuelven desde la ubicación del script— para
que cualquiera pueda ejecutarlos desde cualquier directorio.
