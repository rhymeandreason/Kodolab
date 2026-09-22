<p align="center"><img src="kodolab-wordmark.svg" alt="Kodolab" height="56"></p>

<p align="center"><b>Interactive 3D biology, built in plain HTML and JavaScript. Reviewed by humans.</b><br>
<a href="https://kodolab.org">kodolab.org</a> · <a href="https://kodolab.org/lessons">Lessons</a> · <a href="https://kodolab.org/contribute">Contribute</a></p>

---

Kodolab is a platform for learning Biology with 3D simulations. This repo contains our custom library for rendering molecular animations, proteins, membrane simulations, and composing scenes into lessons. 

While there are many libaries for scientific rendering, Kodolab focuses on visuals for teaching. So, we animate protons hopping and have an abstracted scale at membrane/cell level. Protein data is parsed from PDB files into js files that are much smaller to load on student laptops. A design system keeps pages modern and clean.

Currently it runs on top of Three.js R128, update to a more current versions is coming soon. 

I will be cleaning this up a ton in the next several weeks, so star and come back later! 

## How it's built

* **Components.** 3D scenes you mount by name and drive with parameters: a membrane, a plant cell, a leaf, a protein from the PDB, liquid water. `X.mount(el, params)`, then `set`, `on`, `destroy`.
* **Lessons.** Hand-built pages, one HTML file each. They are the reference implementations, and they are where new components come from.
* **Generated apps.** Describes an app; a model writes one HTML file from [`demos/docs/Components.md`](demos/docs/Components.md) .
* **Science first.** Molecules carry checkers for their geometry and chemistry. Proteins and nucleic acids use deposited coordinates from the PDB. [`demos/docs/SCIENCE.md`](demos/docs/SCIENCE.md) is the rulebook for molecular scale.

No build step, no framework. Three.js loads from a CDN.

## Run it locally

```bash
git clone https://github.com/rhymeandreason/Kodolab.git
cd Kodolab
node demos/tools/dev-server.js
```

Open <http://localhost:8817/demos/water-lab.html>. The server has zero dependencies and live-reloads. More in [`demos/docs/dev.md`](demos/docs/dev.md).

## Contribute

You don't need to write code to help. Review a lesson's science or teaching and [open an issue](https://github.com/rhymeandreason/Kodolab/issues/new). If you do code, you can add a molecule or protein or build a new 3D component. [kodolab.org/contribute](https://kodolab.org/contribute) walks through each path.

## License

Code is [AGPL-3.0](LICENSE). Lesson text, images and docs are [CC BY-NC 4.0](LICENSE-CONTENT). You're welcome to teach with it and remix it for your class. 

All lessons are embeddable via iframe. See kodolab.org/lessons

Feedback on science is always welcome!
