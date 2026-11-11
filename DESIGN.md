# Coffee Master — sistema de diseño

Paleta marfil, marrón, lavanda y durazno, con botones tipo píldora y tipografías de marca. Web y mobile usan los mismos valores, en modo claro y oscuro.

## Colores

| Nombre | Hex | Rol |
|---|---|---|
| Marrón | `#3D2825` | Texto principal, botón primario (claro), tarjetas (oscuro) |
| Marrón profundo | `#2A1A18` | Fondo en modo oscuro |
| Marfil | `#FFFFF0` | Fondo en modo claro; texto en modo oscuro |
| Arena | `#F3EFDF` | Tinte suave: superficies `muted` en claro |
| Lavanda | `#B9A5D6` | Acento: insignia del catálogo, botón primario (oscuro), foco (oscuro) |
| Durazno | `#F0AE86` | Acento: favoritos e insignia de recetas propias |

Los acentos se alternan y no compiten en el mismo elemento. Lavanda y durazno llevan siempre texto marrón encima.

## Tokens semánticos

Web: variables CSS en `web/app/globals.css` (`:root` y `.dark`), usadas con clases de Tailwind. Mobile: `lightColors` y `darkColors` en `mobile/context/ThemeContext.tsx`, usadas con `useAppTheme()`. Ningún componente escribe colores a mano.

| Token | Claro | Oscuro |
|---|---|---|
| `background` | `#FFFFF0` | `#2A1A18` |
| `foreground` | `#3D2825` | `#FFFFF0` |
| `card` | `#FFFFFF` | `#3D2825` |
| `primary` | `#3D2825` | `#B9A5D6` |
| `primary-foreground` | `#FFFFF0` | `#3D2825` |
| `muted` | `#F3EFDF` | `#4A332F` |
| `muted-foreground` | `#6B534F` | `#D9C9C0` |
| `border` (web) | `#DDD5BE` | `#5A423D` |
| `input` (web) / `border` (mobile) | `#9B8782` | `#8F7772` |
| `ring` (web) | `#3D2825` | `#B9A5D6` |
| `destructive` | `#B3261E` | `#FF8A80` |
| `accent` / `accent-foreground` | `#B9A5D6` / `#3D2825` | igual |
| `highlight` / `highlight-foreground` | `#F0AE86` / `#3D2825` | igual |
| `popover` / `popover-foreground` (web) | igual a `card` | igual a `card` |
| `scrollbar-thumb` / `scrollbar-thumb-hover` (web) | lavanda 75 % + `foreground` 25 % (3.3:1 sobre marfil) / lavanda 50 % + `foreground` | lavanda al 65 % / lavanda |
| `card-hover` (web) / `cardHover` (mobile) | `card` teñida 14 % con lavanda (`#F5F2F9`) | `card` teñida 14 % con lavanda (`#4E3A3E`) |

## Contraste (WCAG, calculado)

| Combinación | Ratio |
|---|---|
| Marrón sobre marfil | 13.6 |
| Marrón sobre arena | 11.9 |
| Marrón sobre lavanda | 6.2 |
| Marrón sobre durazno | 7.3 |
| `muted-foreground` sobre fondo / `muted` (claro) | 7.0 / 6.1 |
| Marfil sobre marrón profundo | 16.5 |
| Lavanda sobre marrón profundo | 7.5 |
| `muted-foreground` sobre fondo / `muted` (oscuro) | 10.4 / 7.2 |
| `destructive` sobre fondo (claro / oscuro) | 6.5 / 7.3 |
| Lavanda sobre marfil | 2.2 (solo decoración) |
| Durazno sobre marfil | 1.9 (solo decoración) |

Reglas: sobre marfil o arena el texto es siempre marrón; lavanda y durazno no se usan como texto sobre esos fondos, solo como bloques, insignias o ilustración. El anillo de foco en claro es marrón (lavanda no llega a 3:1).

## Tipografía

| Uso | Fuente |
|---|---|
| Nombre de la app (encabezado) | Bagel Fat One |
| Líneas de apoyo bajo el nombre | Gochi Hand |
| Todo el resto del texto | Roboto Mono |

Los tamaños de letra de cada pantalla no dependen de la fuente: se definen en cada componente. Web carga las fuentes con `next/font/google` (`web/app/layout.tsx`). Mobile las carga desde `mobile/assets/fonts` con `useFonts` (`mobile/app/_layout.tsx`); en React Native cada peso es un archivo, y `mobile/components/ui/Text.tsx` elige el archivo según `fontWeight`.

## Componentes

- **Selectores:** siempre el `Select` de shadcn (`web/components/ui/select.tsx`, `OptionSelect` para listas de `{ value, label }`), nunca el `<select>` nativo. La flecha va dentro del campo, la lista usa `popover` y la opción resaltada usa `accent`. En mobile los selectores son chips del tema (`RecipeFilters`, `RecipeFormFields`).
- **Pantalla de carga (mobile):** la sticker de la marca, con fondo marfil en claro y marrón en oscuro (`mobile/assets/splash-light.png` y `splash-dark.png`), centrada sobre el fondo del tema. Es el splash nativo de un build (`app.json`) y la pantalla de carga de la app (`SplashView`).
- **Chat:** los mensajes del usuario van al borde derecho; los del asistente ocupan todo el ancho. La lista se desvanece hacia el color de fondo arriba y abajo para indicar que hay más contenido (`FadeEdge` en mobile, máscara en web).
- **Vínculos de formularios de acceso:** uno debajo del otro, centrados y con zona de toque de 44 pt.
- **Tarjetas clicables:** `Card interactive` en web (enlace extendido sobre toda la tarjeta, puntero, fondo `card-hover` y borde `accent` al pasar el mouse, contorno al enfocar). En mobile la tarjeta usa `cardHover` y borde `accent` mientras se presiona.

- **Barras de desplazamiento (web):** finas (4 px visibles), redondeadas, sin fondo y con el color `scrollbar-thumb`; Firefox usa `scrollbar-width: thin`. En mobile las dibuja el sistema operativo y no se personalizan.

## Forma

- Botones tipo píldora (`rounded-full` en web, `borderRadius: 999` en mobile); tarjetas con bordes redondeados (`--radius: 1rem`).
- Insignias: lavanda para el catálogo, durazno para las recetas propias. Favorito: durazno.

## Marca

- Íconos: taza humeante en lavanda (`cup-lavanda.png`) o durazno (`cup-durazno.png`), con fondo transparente.
- Archivos originales (stickers 4000 × 4000 px): `design/brand/`. Derivados: `web/public/brand/`, `mobile/assets/brand/`; íconos de la app en `web/app/icon.png`, `web/app/apple-icon.png`, `mobile/assets/icon.png`, `adaptive-icon.png` y `splash-icon.png`.
- Referencia del sistema de origen: `design/merece-design-system.md`.
