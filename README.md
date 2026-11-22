# koi-pond

An animated koi pond for the Claude Code terminal. A band above the prompt shows a
block-pixel pond where big koi (kohaku, sanke, showa, ogon and chagoi) swim across
with wagging tails, flapping fins and shadows, under drifting lily pads and lotus
flowers, with slow caustic ripples on the water. Colors follow the Salma Koi Classic
palette. Each cell is a half block, so pixels are square and the pond animates at
about 15 frames per second.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install koi-pond --marketplace Cat-things/koi-pond
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

From a shell:

```
claude plugin install koi-pond --marketplace Cat-things/koi-pond
```

## Usage

- The pond appears above the prompt as soon as the plugin is active.
- `/koi` hides or shows it.
- Collapsing the band (`ctrl+x ctrl+a`) pauses the animation.

The pond is drawn in the terminal only; other surfaces are left unchanged.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `avoidOverlap` (Avoid overlap) | on | Fish steer into separate lanes, swim partly past the pond's edge, or turn back instead of overlapping. Off, they pass through one another. |

Change it from the plugin's row in `/config`.

## License

MIT
