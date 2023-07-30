/**
 * A lazy loader for the THREE.js script.
 *
 * Usage:
 *
 * ```typescript
 * const linkElement = <HTMLLinkElement>document
 *     .querySelector('link[rel="parallax-three-js"]')
 * // TODO: Check if linkElement actually exists
 * const loader = new ThreeLoader(linkElement)
 *     .load(() => {
 *         // Do something on load
 *     })
 * ```
 */
export class ThreeLoader {
    private threeLink: HTMLLinkElement
    private animeLink: HTMLLinkElement

    public constructor(
        threeLink: HTMLLinkElement,
        animeLink: HTMLLinkElement
    ) {
        this.threeLink = threeLink
        this.animeLink = animeLink
    }

    /**
     * Load THREE.js into a script element.
     *
     * The script element is placed below the given link element.
     * See index.ts for a usage example.
     */
    public async loadThree(): Promise<HTMLScriptElement> {
        return new Promise((resolve, reject) => {
            const threeId = this.threeLink.getAttribute('data-id')
            if (threeId === undefined) {
                reject(new Error(
                    'The link element has to supply a data-id attribute!'
                ))
            }

            const threeHref = this.threeLink.getAttribute('href')
            if (threeHref === undefined) {
                reject(new Error(
                    'The link element has to supply a href attribute!'
                ))
            }

            // Check if there is already a THREE.js script element.
            let threeElement = <HTMLScriptElement>
                document.getElementById(threeId)
            if (threeElement !== null) {
                resolve(threeElement)
                return
            }

            // If not, create a new one.
            threeElement = document.createElement('script')
            threeElement.onload = () => {
                resolve(threeElement)
            }
            threeElement.id = threeId
            threeElement.src = threeHref
            // Insert THREE.js after the link element.
            this.threeLink.parentNode.insertBefore(
                threeElement, this.threeLink.nextSibling
            )
        })
    }

    /**
     * Load anime.js into a script element.
     *
     * The script element is placed below the given link element.
     * See index.ts for a usage example.
     */
    public async loadAnime(): Promise<HTMLScriptElement> {
        return new Promise((resolve, reject) => {
            const animeId = this.animeLink.getAttribute('data-id')
            if (animeId === undefined) {
                reject(new Error(
                    'The link element has to supply a data-id attribute!'
                ))
            }

            const animeHref = this.animeLink.getAttribute('href')
            if (animeHref === undefined) {
                reject(new Error(
                    'The link element has to supply a href attribute!'
                ))
            }

            // Check if there is already a THREE.js script element.
            let animeElement = <HTMLScriptElement>
                document.getElementById(animeId)
            if (animeElement !== null) {
                resolve(animeElement)
                return
            }

            animeElement = document.createElement('script')
            animeElement.onload = () => {
                resolve(animeElement)
            }
            animeElement.id = animeId
            animeElement.src = animeHref
            // Insert THREE.js after the link element.
            this.animeLink.parentNode.insertBefore(
                animeElement, this.animeLink.nextSibling
            )
        })
    }
}
