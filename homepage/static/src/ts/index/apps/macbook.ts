declare var ParallaxHook: any


document.addEventListener('DOMContentLoaded', async () => {
    const macbookContainer = <HTMLDivElement>
        document.getElementById('macbook-container')
    const macbookCodeContainer = <HTMLDivElement>
        document.getElementById('macbook-code-container')
    const hook = new ParallaxHook(
        macbookContainer,
        () => {},
        (progress: any) => {
            macbookCodeContainer.scrollTop = progress.value * 700;
            macbookContainer.style.transform = `translateY(${5 - progress.value * 10}rem)`
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
