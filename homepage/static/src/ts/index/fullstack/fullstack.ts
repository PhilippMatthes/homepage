declare var ParallaxHook: any


document.addEventListener('DOMContentLoaded', async () => {
    const container = <HTMLDivElement>
        document.getElementById('fullstack')
    const image = <HTMLDivElement>
        document.getElementById('fullstack-image')
    const hook = new ParallaxHook(
        container,
        () => {},
        (progress: any) => {
            container.scrollTop = progress.value * 700;
            // Scale the macbook up as it moves up
            image.style.transform = `scale(${0.8 + progress.value * 0.2})`
            // Show a material shadow as the terminal moves up
            image.style.boxShadow = `0`
                + ` ${progress.value * 10}rem`
                + ` ${progress.value * 20}rem`
                + ` rgba(75, 123, 236, ${progress.value * 0.1})`
        },
        () => {}
    )

    const updateDeviceWidth = () => {
        if (document.documentElement.clientWidth < 1023) {
            hook.detach()
        } else {
            hook.attach()
        }
    }
    updateDeviceWidth()
    window.addEventListener('resize', updateDeviceWidth, false)
})
