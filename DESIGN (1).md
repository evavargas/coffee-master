---
name: Artisanal Barista Companion
colors:
  surface: '#fff8f5'
  surface-dim: '#efd5c6'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ea'
  surface-container: '#ffeade'
  surface-container-high: '#fee3d4'
  surface-container-highest: '#f8ddcf'
  on-surface: '#261910'
  on-surface-variant: '#50453e'
  inverse-surface: '#3d2d23'
  inverse-on-surface: '#ffede4'
  outline: '#82746d'
  outline-variant: '#d4c3ba'
  surface-tint: '#79573f'
  primary: '#553722'
  on-primary: '#ffffff'
  primary-container: '#6f4e37'
  on-primary-container: '#eec1a4'
  inverse-primary: '#eabda0'
  secondary: '#635e56'
  on-secondary: '#ffffff'
  secondary-container: '#e9e1d7'
  on-secondary-container: '#69645c'
  tertiary: '#7c1401'
  on-tertiary: '#ffffff'
  tertiary-container: '#9d2d16'
  on-tertiary-container: '#ffbaab'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdcc6'
  primary-fixed-dim: '#eabda0'
  on-primary-fixed: '#2d1604'
  on-primary-fixed-variant: '#5f402a'
  secondary-fixed: '#e9e1d7'
  secondary-fixed-dim: '#cdc5bc'
  on-secondary-fixed: '#1e1b15'
  on-secondary-fixed-variant: '#4a463f'
  tertiary-fixed: '#ffdad3'
  tertiary-fixed-dim: '#ffb4a4'
  on-tertiary-fixed: '#3e0500'
  on-tertiary-fixed-variant: '#891e07'
  background: '#fff8f5'
  on-background: '#261910'
  surface-variant: '#f8ddcf'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22.5px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 19.5px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a warm, tactile, and specialty-coffee-inspired environment tailored for a virtual barista companion. The experience mirrors walking into a quiet, third-wave espresso bar: grounded, sensory, and meticulously crafted. It balances artisanal warmth with conversational clarity.

### Target Audience & Voice
Designed for coffee enthusiasts, home brewers, and curious drinkers seeking brewing advice, bean recommendations, and recipe diagnostics. 
The conversational tone uses Spanish Rioplatense with natural voseo (*"Mirá, para este filtrado te conviene una molienda media-fina..."*). The voice is welcoming, experienced, unpretentious, and precise.

### Aesthetic Movement
A synthesis of **Warm Minimalism** and **Tactile Specialty Editorial**:
- Calibrated, earthy tonal layers rather than stark stark contrast.
- Generous breathing room replicating clean marble counters, natural wood, and ceramic textures.
- Friendly, organic geometry that feels approachable and human.

## Colors

The palette reproduces the sensory qualities of roast profiles, steamed oat milk, and ceramic ware across both lighting conditions.

### Light Mode (Default)
- **Canvas Base (`#faf6f1`):** Warm raw cream paper.
- **Primary Text (`#2b1d14`):** Dark roasted espresso, high-legibility without harsh synthetic black.
- **Primary Accent & CTAs (`#6f4e37`):** Rich coffee brown paired with pure white or soft latte text.
- **Surfaces & Barista Chat Bubbles (`#f1e9df`):** Soft steamed milk / ceramic tint.
- **Borders & Dividers (`#e5d9cc`):** Oat flour, low contrast to preserve soft structure.
- **Muted Text & Captions (`#7c685b`):** Roasted hazelnut, warm intermediate contrast.
- **Destructive & Alerts (`#c84b31`):** Baked terracotta, organic and warm warning tint.

### Dark Mode
- **Canvas Base (`#1a120c`):** Deep espresso roast.
- **Primary Surfaces (`#261b13`):** Dense espresso crema.
- **Secondary Surfaces & Chat Bubbles (`#34261c`):** Warm toasted crust.
- **Primary Text (`#f5ede6`):** Froth white with amber undertones.
- **Accent & Interactive (`#9e7252`):** Warm caramel extraction.
- **Borders & Rules (`#3d2e23`):** Subtle roasted boundary line.

## Typography

The type stack leverages clean, contemporary geometric grotesque architecture with humanist roundings (`Plus Jakarta Sans`), seamlessly integrating with system-native fallback environments.

- **Headlines:** Set firmly at `font-weight: 600` with subtle negative tracking on large scales, giving brew titles, origin headers, and barista greetings a stable presence.
- **Body Text:** Standard conversational bubbles and informational guides range from 14px to 16px with a strict 1.5 line-height ratio (`line-height: 1.5`), ensuring extended coffee brewing instructions remain relaxed and readable.
- **Labels & Microcopy:** Feature slightly elevated tracking (`0.02em` - `0.04em`) for extraction ratios (e.g., *1:16*), bean varieties, water temperature markers, and brew step timers.

## Layout & Spacing

The layout is built on a conversation-first fluid grid with dedicated reading constraints:

### Layout Rhythm
- **Chat Feed Constraints:** The central chat container never stretches beyond a maximum readable width of `720px` to maintain optimal conversational flow.
- **Companion / Recipe Cards Panel:** On desktop, a 12-column layout expands the workspace: an 8-column primary interaction area paired with a 4-column reference sidebar for brewing parameters, tasting notes, and grind setting dials.
- **Mobile Experience:** Fully responsive edge-to-edge layout with a bottom-anchored, tactile messaging toolbar and contextual recipe drawers.

### Spacing Scale
- `space-xs` (4px): Inline token chips, tag padding, micro icon spacing.
- `space-sm` (8px): Message bubble vertical clustering, input inner horizontal spacing.
- `space-md` (16px): Card internal padding, separation between distinct message actors.
- `space-lg` (24px): Card stack gaps, section demarcations, modal gutters.
- `space-xl` (40px): Major stage transitions, empty state canvas breathing room.

## Elevation & Depth

Visual hierarchy rejects sharp artificial drop shadows in favor of **warm artisanal ambient shadows** and **tonal card layering**. Depth feels physical, like paper recipe cards resting on polished wood.

### Shadow Profiles
- **Ambient Level 1 (Resting Cards, Bubbles):**  
  `0 2px 8px -2px rgba(43, 29, 20, 0.04), 0 1px 3px 0 rgba(43, 29, 20, 0.02)`  
  A gentle grounding shadow carrying an espresso-tinted hue rather than cold charcoal.
- **Ambient Level 2 (Floating Action Inputs, Dropdowns):**  
  `0 8px 20px -4px rgba(43, 29, 20, 0.08), 0 3px 6px -2px rgba(43, 29, 20, 0.04)`  
  Provides distinct elevation for dynamic elements like the prompt composer.
- **Ambient Level 3 (Brew Timers, Recipe Overlays):**  
  `0 16px 32px -8px rgba(43, 29, 20, 0.12), 0 4px 12px -2px rgba(43, 29, 20, 0.06)`

### Dark Mode Elevation
Shadows become imperceptible against deep espresso backgrounds; depth transitions to **surface tiering**:
- Base layer: `#1a120c`
- Elevated bubble/card: `#261b13`
- Active/Hover layer: `#34261c`
- Structural perimeter: 1px border of `#3d2e23`

## Shapes

The interface adopts a welcoming, soft-organic corner radius profile ranging consistently between `12px` and `16px`.

- **Component Base (`rounded-base` / 8px):** Stepper buttons, metric tags, and fine adjustment controls.
- **Cards & Chat Bubbles (`rounded-lg` / 16px):** The default radius for barista message bubbles, user bubbles, and informational cards. User bubbles feature an asymmetric radius anchor (`4px` on the bottom-right tail) to convey origin, while Barista responses anchor `4px` on the bottom-left tail.
- **Floating Controls & Actions (`rounded-xl` / 24px or full pill):** Prompt bar containers, primary pill buttons, and brewing method toggle chips.

## Components

### Chat Message Bubbles
- **Barista (Assistant):** Background `#f1e9df`, border 1px solid `#e5d9cc`, text `#2b1d14`. Placed on the left margin. Formatted with structured markdown, bold key variables (time, ratio, temperature), and small origin tags.
- **User:** Background `#6f4e37`, border none, text `#ffffff`. Anchored right.
- **Radius:** Asymmetric 16px corners with a 4px corner on the speaker side anchor.

### Buttons
- **Primary:** Background `#6f4e37`, text `#ffffff`, font-weight 600, padding `12px 24px`, border-radius 9999px (pill). Hover state subtle brightness boost with warm shadow (`rgba(111, 78, 55, 0.25)`).
- **Secondary / Ghost:** Transparent background, border 1px solid `#e5d9cc`, text `#2b1d14`, hover background `#f1e9df`.
- **Rioplatense Quick Prompts (Suggested Chips):** Background `#faf6f1`, border 1px solid `#e5d9cc`, text `#6f4e37`. Displays prompts such as *"¿Cómo calibro el espresso?"*, *"Tengo granos de Etiopía"*, *"Pasame la receta de V60"*.

### Input Fields & Composer
- Chat composer rests elevated at the bottom of the viewport with a floating wrapper.
- Background `#ffffff` (in light mode) or `#261b13` (in dark mode), border 1px solid `#e5d9cc`, border-radius 24px.
- Send action represented by a warm coffee `#6f4e37` circular icon button with high-contrast icon.
- Focus state: Outline none, border `#6f4e37` with an ambient warm glow ring `0 0 0 3px rgba(111, 78, 55, 0.15)`.

### Cards & Recipe Walkthroughs
- Recipe card: Background `#f1e9df`, border 1px solid `#e5d9cc`, corner radius 16px, padding 20px.
- Step-by-step extraction timer widget: Displays bold numeric counters for water poured (in grams) and elapsed brew time in seconds, separated by thin oat `#e5d9cc` horizontal dividers.

### Chips & Selection Badges
- Filter selection chips (e.g., Roast Profile: *Claro*, *Medio*, *Oscuro*; Process: *Lavado*, *Natural*):
  - Inactive: Background transparent, border 1px solid `#e5d9cc`, text `#7c685b`.
  - Active: Background `#6f4e37`, border 1px solid `#6f4e37`, text `#ffffff`.

### Checkboxes & Toggle Switches
- Custom circular selection handles reminiscent of espresso portafilter baskets.
- Active toggle fill `#6f4e37` with white thumb knob. Inactive border `#e5d9cc` over `#f1e9df`.