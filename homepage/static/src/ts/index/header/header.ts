/**
 * Author: Philipp Matthes
 *
 * This module is used for a parallax effect on images.
 *
 * It uses THREE.js (https://threejs.org/) on a canvas
 * together with an image and a depth map to apply
 * parallax occlusion mapping, similar to the
 * 3Dify app (https://github.com/3dify-app).
 *
 * Usage:
 *
 * ```html
 * <!-- Somewhere in your html --!>
 * <img ... src="path/to/preview.webp"
 *          class="parallax"
 *          data-parallax-depth-map="path/to/preview-depth.webp">
 * <!-- Preferably at the bottom of your body element --!>
 * <link rel="parallax-three-js"
 *       href="path/to/three.min.js"
 *       data-id="id-of-the-lazyloaded-three-script-element">
 * <!-- THREE.js will be loaded lazily to this location --!>
 * ```
 *
 * Notes:
 * - The srcset attribute is not supported.
 * - The image element gets lazily replaced (only on devices
 * wider than 1023 pixels) by a canvas which will render a
 * THREE.js parallax scene with the given depth map.
 * - THREE.js and the parallax effect is only loaded, when the
 * screen exceeds mobile device width of 1023 pixels. This also
 * applies to screen resizing events and not only the initial
 * page load.
 */


import { ThreeLoader } from './loader'
import { ParallaxImage } from './image'


document.addEventListener('DOMContentLoaded', async () => {
    const threeLink = <HTMLLinkElement>document
        .querySelector('link[rel="parallax-three-js"]')
    const animeLink = <HTMLLinkElement>document
        .querySelector('link[rel="parallax-anime-js"]')

    const threeLoader = new ThreeLoader(threeLink, animeLink)
    const parallaxImageElements = document
        .querySelectorAll<HTMLImageElement>('img.parallax')
    const parallaxImages = Array.from(parallaxImageElements)
        .map((element) => new ParallaxImage(element))

    const updateWindowDimensions = async () => {
        await threeLoader.loadThree()
        await threeLoader.loadAnime()
        for (let parallaxImage of parallaxImages) {
            await parallaxImage.load()
            parallaxImage.show()
        }
    }

    await updateWindowDimensions()
    window.addEventListener('resize', updateWindowDimensions, false)
})

