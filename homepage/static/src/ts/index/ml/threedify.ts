
declare var ParallaxHook: any


document.addEventListener('DOMContentLoaded', async () => {
    const container = <HTMLDivElement>
        document.getElementById('three-dify-tech-demo-container')
    const depthElement = <HTMLDivElement>
        document.getElementById('three-dify-tech-demo-depth')
    const photoElement = <HTMLDivElement>
        document.getElementById('three-dify-tech-demo-photo')
    new ParallaxHook(
        container,
        () => {},
        (progress: any) => {
            let opacity = Math.min(progress.value * 2, 1)
            depthElement.style.opacity = `${opacity}`
            depthElement.style.transform = `translateY(${-5 + progress.value * 10}rem)`
            photoElement.style.opacity = `${1 - opacity}`
            photoElement.style.transform = `translateY(${-5 + progress.value * 10}rem)`
        },
        () => {}
    ).attach()
})
