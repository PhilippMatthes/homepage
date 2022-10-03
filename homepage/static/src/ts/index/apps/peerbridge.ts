declare var ParallaxHook: any


document.addEventListener('DOMContentLoaded', async () => {
    const container = <HTMLDivElement>
        document.getElementById('peerbridge-demo-container')
    const element = <HTMLDivElement>
        document.getElementById('peerbridge-demo')
    new ParallaxHook(
        container,
        () => {},
        (progress: any) => {
            element.style.transform = `translateY(${-2.5 + progress.value * 15}rem)`
            // Scale the phone up as it moves up
            element.style.transform += ` scale(${1 + progress.value * 0.2})`
        },
        () => {}
    ).attach()
})
