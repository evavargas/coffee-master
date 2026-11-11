# Merece — Design System v2 (paleta lavanda + durazno)
 
Actualización del design system anterior (marfil / azul / marrón / arena). **El azul cobalto #2F62F5 sale de la marca** y en su lugar entran dos acentos de pastelería: **lavanda** y **durazno**. Todo lo demás (estructura, bordes redondeados, botones píldora, ilustraciones a mano) se mantiene, con los ajustes indicados abajo.
 
Merece es una ** cafetería de especialidad/pastelería **, en Montevideo.
 
---
 
## 1. Colores
 
| Token | Hex | Rol | Hover / variante |
|---|---|---|---|
| `--marron` | `#3D2825` | Texto principal, logo, fondos oscuros | `#2A1A18` |
| `--marfil` | `#FFFFF0` | Fondo principal; texto sobre marrón | — |
| `--lavanda` | `#B9A5D6` | Acento A (bañado de la M, taza, sellos, badges) | `#A48DC7` |
| `--durazno` | `#F0AE86` | Acento B (bañado de la M, taza, sellos, badges) | `#E8976A` |
| `--arena` | `#F3EFDF` | Solo tinte suave de fondo o hover sobre marfil | — |
 
**Eliminado:** `--azul #2F62F5` y su hover `#1F4FE0`. Reemplazar todas sus apariciones:
- Botones primarios: pasan a **fondo marrón + texto marfil** (hover `#2A1A18`).
- Acentos, links decorativos, sellos, íconos: pasan a **lavanda o durazno**.
- Links de texto sobre marfil: **marrón subrayado** (no lavanda ni durazno, ver contraste).
**Proporción sugerida:** 50% marfil · 30% marrón · 10% lavanda · 10% durazno.
 
**Uso de los dos acentos:** se alternan, nunca compiten en el mismo elemento. Ideas: un acento por categoría (p. ej. lavanda = pastelería/dulce, durazno = café), o alternar por sección. Existen dos versiones del logo/sticker: M bañada en lavanda y M bañada en durazno.
 
```css
:root {
  --marron: #3D2825;  --marron-hover: #2A1A18;
  --marfil: #FFFFF0;
  --lavanda: #B9A5D6; --lavanda-hover: #A48DC7;
  --durazno: #F0AE86; --durazno-hover: #E8976A;
  --arena: #F3EFDF;
}
```
 
## 2. Contraste (WCAG, calculado)
 
| Combinación | Ratio | Uso |
|---|---|---|
| Marrón sobre marfil | 13.6 | ✅ Cualquier texto |
| Marfil sobre marrón | 13.6 | ✅ Cualquier texto |
| Marrón sobre arena | 11.9 | ✅ Cualquier texto |
| Durazno sobre marrón | 7.3 | ✅ Cualquier texto |
| Lavanda sobre marrón | 6.2 | ✅ Cualquier texto |
| Marrón sobre durazno | 7.3 | ✅ Texto en badges/botones durazno |
| Marrón sobre lavanda | 6.2 | ✅ Texto en badges/botones lavanda |
| Marrón sobre hover lavanda `#A48DC7` | 4.7 | ✅ Pasa texto normal |
| Marrón sobre hover durazno `#E8976A` | 5.9 | ✅ Pasa texto normal |
| Lavanda sobre marfil | 2.2 | ❌ Nunca para texto. Solo ilustración/decoración |
| Durazno sobre marfil | 1.9 | ❌ Nunca para texto. Solo ilustración/decoración |
 
**Reglas:**
- Sobre **marfil**, el texto siempre es **marrón**. Lavanda y durazno ahí solo como ilustraciones, bañados, bloques de color (con texto marrón encima) o detalles grandes no informativos.
- Sobre **marrón**, el texto puede ser marfil, lavanda o durazno.
- Botón de acento: fondo lavanda o durazno + **texto marrón**.
## 3. Tipografía
 
| Uso | Fuente | Notas |
|---|---|---|
| Logo / wordmark "Merece" | **Bagel Fat One** | Letras con leve rotación y salto de línea base (naive). La M lleva el "bañado" superior en lavanda o durazno. |
| Títulos display | **Bagel Fat One** o **Arimo** en mayúsculas | Bagel para títulos de marca/hero; Arimo para títulos funcionales grandes. Se puede aplicar leve rotación por letra para el estilo naive. |
| Acentos manuscritos / taglines | **Gochi Hand** | Estilo trazo a mano, mayúsculas con tracking amplio (~0.12em). |
| Texto / cuerpo | **Roboto Mono** | Se mantiene del sistema anterior. |
| Datos chicos (handle, legales) | **Nunito 800** |  y textos cortos. |
 
## 4. Estilo
 
- **Naive design:** lettering y dibujos con apariencia hecha a mano, letras levemente torcidas y desparejas, sin perder legibilidad.
- **Ilustraciones de línea** a mano, trazo grueso (~3.6–4.6 px a escala 1000 px), puntas redondeadas, filtro sutil de irregularidad (feTurbulence + feDisplacementMap, scale ~2). Ícono principal: **taza de café humeante**, en lavanda o durazno según la versión.
- **Secciones grandes** alternando fondos **marfil y marrón** (ya no azul). Bloques de lavanda o durazno solo como bandas/tarjetas chicas con texto marrón.
- **Bordes redondeados** y **botones tipo píldora**.
## 5. Logo / sticker (referencia aprobada)
 
- Formato circular (sticker 4 × 4 cm).
- Orden vertical: **taza humeante** (color acento) → **Merece** (Bagel Fat One, M bañada en el acento).
- 4 versiones: lavanda/marfil, lavanda/marrón, durazno/marfil, durazno/marrón. Fondo marfil → letras marrón; fondo marrón → letras marfil.
## 6. Impresión
 
- Los cuatro colores se pueden reproducir con tinta plana. Conviene pedir prueba en el papel final (kraft o marfil), sobre todo para lavanda y durazno, que en papel tienden a apagarse.
- Equivalencias Pantone/CMYK: pedir a la imprenta que las matchee a partir de los HEX y validar con muestra impresa.
## 7. Cambios respecto al sistema anterior (checklist para actualizar el artifact)
 
1. Quitar `--azul` y `--azul-hover` de los tokens; agregar `--lavanda`, `--lavanda-hover`, `--durazno`, `--durazno-hover`.
2. Botones primarios azules → marrón con texto marfil.
3. Acentos/sellos/íconos azules → lavanda o durazno (alternando).
4. Secciones con fondo azul → marrón (o banda lavanda/durazno con texto marrón).
5. Revisar que no haya texto lavanda o durazno sobre marfil o arena.
6. Actualizar la tabla de contraste con los valores de la sección 2.
7. Sumar Bagel Fat One (logo/display) y Gochi Hand (acentos manuscritos) a la tipografía.
8. La regla "nunca texto azul sobre marrón" queda obsoleta; ahora lavanda y durazno **sí** funcionan sobre marrón.