/**
 * Author: Philipp Matthes
 *
 * This module is used to apply scroll hooks.
 */

import { SectionHook } from './hook'


document.addEventListener('DOMContentLoaded', async () => {
    const bottomNavigation = <HTMLDivElement> document
        .getElementById('bottom-navigation')
    const navbarElements = bottomNavigation
        .querySelectorAll<HTMLAnchorElement>('a.hook')
    navbarElements.forEach((navbarElement) => {
        const referredId = navbarElement.getAttribute('data-hook-id')
        const referredElement = document.getElementById(referredId)
        new SectionHook(
            referredElement,
            () => {
                navbarElement.classList.add('active')
            },
            () => {},
            () => {
                navbarElement.classList.remove('active')
            }
        ).attach()
    })
})
