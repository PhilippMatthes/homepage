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

    public constructor(threeLink: HTMLLinkElement) {
        this.threeLink = threeLink
    }

    /**
     * Load THREE.js into a script element.
     *
     * The script element is placed below the given link element.
     * See index.ts for a usage example.
     */
    public async load(): Promise<HTMLScriptElement> {
        return new Promise((resolve, reject) => {
            const id = this.threeLink.getAttribute('data-id')
            if (id === undefined) {
                reject(new Error(
                    'The link element has to supply a data-id attribute!'
                ))
            }

            const href = this.threeLink.getAttribute('href')
            if (href === undefined) {
                reject(new Error(
                    'The link element has to supply a href attribute!'
                ))
            }

            // Check if there is already a THREE.js script element.
            let threeElement = <HTMLScriptElement>
                document.getElementById(id)
            if (threeElement !== null) {
                resolve(threeElement)
                return
            }

            // If not, create a new one.
            threeElement = document.createElement('script')
            threeElement.onload = () => {
                resolve(threeElement)
            }
            threeElement.id = id
            threeElement.src = href
            // Insert THREE.js after the link element.
            this.threeLink.parentNode.insertBefore(
                threeElement, this.threeLink.nextSibling
            )
        })
    }
}
