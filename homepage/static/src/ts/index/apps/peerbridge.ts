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
            element.style.transform = `translateY(${-10 + progress.value * 20}rem)`
        },
        () => {}
    ).attach()
})
