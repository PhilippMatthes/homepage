/**
 * A progress for element hooks.
 */
export class Progress {
    value: number

    public constructor(value: number) {
        this.value = value
    }

    /**
     * Determine whether a hooked element is
     * currently inside the viewport.
     */
    public isInside(): boolean {
        return this.value >= 0 && this.value <= 1
    }
}


/**
 * Apply a hook on an html element which notifies the
 * event listener of the current scroll progress.
 *
 * There are three dispatched events:
 * `onProgressChange`, `onEnter` and `onLeave`.
 * `onEnter` is dispatched when the user resizes or scrolls
 * the document such that the element is in view. `onLeave`
 * is dispatched vice versa, when the element leaves the
 * viewport. Additionally, for progress driven events such
 * as animations, the `onProgressChangeInside` event can be utilized.
 *
 * Usage:
 * ```typescript
 * const element = document.getElementById('section-1')
 * const hook = new Hook(
 *     element,
 *     (progress) => {
 *         // Progress changed
 *     },
 *     () => {
 *         // On enter
 *     },
 *     () => {
 *         // On leave
 *     }
 * )
 * hook.attach()
 * ```
 */
abstract class Hook {
    element: HTMLElement

    onEnter: () => void
    onProgressChangeInside: (progress: Progress) => void
    onLeave: () => void

    progress?: Progress
    isAttached: boolean

    public constructor(
        element: HTMLElement,
        onEnter: () => void,
        onProgressChangeInside: (progress: Progress) => void,
        onLeave: () => void,
    ) {
        this.element = element

        this.onEnter = onEnter
        this.onProgressChangeInside = onProgressChangeInside
        this.onLeave = onLeave

        this.progress = undefined
        this.isAttached = false
    }

    abstract calculateProgress(): Progress

    /**
     * Update the hook based on the current element position
     * and dispatch the onEnter or the onLeave event accordingly.
     */
    private async updatePosition(): Promise<void> {
        return new Promise(resolve => {
            const newProgress = this.calculateProgress()
            if (this.progress === undefined) {
                if (newProgress.isInside()) {
                    // The progress is set initially and
                    // the element is inside the viewport
                    this.onEnter()
                }
            } else {
                if (this.progress!.isInside() && !newProgress.isInside()) {
                    // The progress did change and the element
                    // left the viewport
                    this.onLeave()
                }
                if (!this.progress!.isInside() && newProgress.isInside()) {
                    // The progress did change and the element
                    // entered the viewport
                    this.onEnter()
                }
            }
            if (newProgress.isInside()) {
                this.onProgressChangeInside(newProgress)
            }
            this.progress = newProgress
            resolve()
        })
    }

    /**
     * Attach the hook to the document and window events.
     */
    public attach(): void {
        if(this.isAttached) return
        document.addEventListener(
            'scroll', this.updatePosition.bind(this), true
        )
        window.addEventListener(
            'resize', this.updatePosition.bind(this), true
        )
        this.isAttached = true
    }

    /**
     * Detach the hook from the document and window events.
     */
    public detach(): void {
        if (!this.isAttached) return
        document.removeEventListener(
            'scroll', this.updatePosition.bind(this), true
        )
        window.removeEventListener(
            'resize', this.updatePosition.bind(this), true
        )
        this.isAttached = false
    }
}


/**
 * A hook which starts at the top of the element and
 * ends at the bottom of the element.
 */
export class SectionHook extends Hook {
    public calculateProgress(): Progress {
        const scrollTop = window.scrollY
        const elementHeight = this.element.offsetHeight
        const elementTop = this.element.getBoundingClientRect().top + scrollTop
        const windowHeight = window.innerHeight
        const offsetScrollTop = scrollTop + windowHeight
        const progressValue =
            (offsetScrollTop - elementTop) / elementHeight
        // Apply quad in out easing
        const easedProgressValue = progressValue < 0.5
            ? 2 * progressValue * progressValue
            : -1 + (4 - 2 * progressValue) * progressValue
        return new Progress(easedProgressValue)
    }
}

(window as any).SectionHook = SectionHook


/**
 * A hook which starts at the top of the element and
 * ends at the bottom of the element, offset by the
 * viewport height for parallax effects
 */
export class ParallaxHook extends Hook {
    public calculateProgress(): Progress {
        const scrollTop = window.scrollY
        const elementHeight = this.element.offsetHeight
        const elementTop = this.element.getBoundingClientRect().top + scrollTop
        const windowHeight = window.innerHeight
        const offsetScrollTop = scrollTop + windowHeight
        const progressValue =
            (offsetScrollTop - elementTop) / (elementHeight + windowHeight)
        // Apply quad in out easing
        const easedProgressValue = progressValue < 0.5
            ? 2 * progressValue * progressValue
            : -1 + (4 - 2 * progressValue) * progressValue
        return new Progress(easedProgressValue)
    }
}

(window as any).ParallaxHook = ParallaxHook
