# Molienda, ratios, agua y cálculos

## Molienda
La molienda es la variable que más cambia el resultado. Regla general: **más fina = más superficie de contacto = más extracción** (y más tiempo de preparación). **Más gruesa = menos extracción**.

### Escala orientativa
- **Muy fina** (tipo harina / azúcar impalpable): espresso.
- **Fina** (tipo sal fina): espresso en molinos de rebabas.
- **Media-fina** (tipo arena fina): moka (~12 clics en Timemore C2S), V60, AeroPress, Chemex.
- **Media** (tipo arena gruesa): filtro en cono plano, goteo.
- **Gruesa** (tipo sal gruesa / copos): prensa francesa, cold brew.
- **Muy gruesa**: cold brew con infusión larga.

### Relación con el tiempo
- Espresso: si el tiempo de extracción es menor a ~20 s, la molienda está demasiado gruesa o la dosis es muy baja. Si pasa de ~35 s, está demasiado fina o la dosis es muy alta.
- Filtro: si el tiempo total pasa de ~4 min, la molienda es demasiado fina. Si termina en menos de ~2 min, es demasiado gruesa.

### Consejos
- En el Timemore C2S, **más clics = más grueso**. Las referencias por método están en [recetario/10-equipo.md](recetario/10-equipo.md).
- Ajustar de a un paso chico por vez (un "clic" del molino).
- Cambiar una sola variable a la vez: molienda, dosis, temperatura o tiempo.
- Un molino de rebabas (burr) da una molienda más pareja que uno de cuchillas, que genera finos y gruesos mezclados.

## Ratios de referencia
Vocabulario:
- **Dosis**: gramos de café molido seco (ej.: 18 g).
- **Ratio**: agua por gramo de café. "1:15" significa 15 g de agua por cada 1 g de café.
- **Rendimiento**: gramos de bebida que salen (ej.: 36 g de espresso).

| Método | Ratio típico | Ejemplo con 15 g de café |
|---|---|---|
| Espresso | 1:2 (rango 1:1,5 a 1:2,5) | 30 g de bebida |
| Espresso ristretto | 1:1,5 | 22,5 g de bebida |
| Espresso lungo | 1:3 | 45 g de bebida |
| V60 / goteo | 1:15 a 1:17 | 225 a 255 ml de agua |
| Prensa francesa | 1:15 a 1:16 (diluido: 1:16 a 1:17) | 225 a 240 ml de agua |
| AeroPress | 1:12 a 1:16 | 180 a 240 ml de agua |
| Cold brew (concentrado) | 1:8 | 120 ml de agua, luego diluir |

## Retención de agua en el café molido
- El café molido **retiene aproximadamente 2 g de agua por cada 1 g de café** (rango 1,8 a 2,5 según molienda y frescura).
- Si el agua total es menor que 2 veces la dosis, **no sale bebida**; queda una pasta húmeda.
- Fórmulas: `agua retenida ≈ 2 × dosis`. `bebida líquida ≈ agua vertida − 2 × dosis` (en filtro, para cálculos rápidos).

### Ejemplo: 30 g de café y 20 g de agua
- Ratio: 1:0,67. Está **muy por debajo** de cualquier método. El café absorbe ~60 g de agua y no sale bebida.
- Opciones con 30 g de café:
  - **Espresso doble**: 30 g de café → ~60 g de espresso (ratio 1:2).
  - **Filtro (V60)**: 30 g de café → 450 a 510 ml de agua (ratio 1:15 a 1:17), en 2 o 3 vertidos.
  - **Prensa francesa**: 30 g de café → 450 a 480 ml de agua (ratio 1:15 a 1:16).
  - **Cold brew**: 30 g de café → 240 ml de agua para concentrado (1:8), diluir después.

## Agua
- Agua filtrada o mineral, sin cloro. Ni destilada (sabor plano) ni muy dura (incrusta y apaga el sabor).
- Referencia: unos 150 ppm de sólidos disueltos totales (TDS), según la SCA.
- Temperatura de extracción:
  - Espresso: 90 a 96 °C (usual 92 a 94 °C).
  - Filtro: 92 a 96 °C; con tueste claro, lo más alto.
  - Prensa: 88 a 94 °C según el café.
  - Cold brew: fría o ambiente, sin calor.

## Cálculos rápidos
- **Agua total para un método** = dosis × ratio. Ej.: 20 g × 15 = 300 ml (filtro).
- **Rendimiento de espresso** = dosis × ratio. Ej.: 18 g × 2 = 36 g.
- **Ratio** = agua (o bebida) ÷ café. Ej.: 300 ÷ 20 = 1:15.
- **Cambiar dosis manteniendo ratio**: nueva agua = nueva dosis × ratio.
- **Escalar una receta**: multiplicar todos los valores por el mismo factor.
- **Gramos de café para un volumen total de agua**: agua (ml) ÷ 15 (método a ratio 1:15). Margen recomendado: +5 a 10% por absorción y residuos.
- Conversiones: 1 ml de agua ≈ 1 g. 1 cucharada de café molido ≈ 5 a 7 g. 1 cucharadita ≈ 2 a 3 g.
