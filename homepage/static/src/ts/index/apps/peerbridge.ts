declare var ParallaxHook: any


document.addEventListener('DOMContentLoaded', async () => {
    const container = <HTMLDivElement>
        document.getElementById('peerbridge-animation-container')
    const preview = <HTMLImageElement>
        document.getElementById('peerbridge-animation-preview')
    const canvas = <HTMLCanvasElement>
        document.getElementById('peerbridge-animation')
    const context = canvas.getContext('2d');

    const frame = new Image()
    frame.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(
            frame,
            0, 0, frame.width, frame.height,
            0, 0, canvas.width, canvas.height
        )
    }

    const frameURL = (index: number) => {
        return `/static/img/peerbridge-animation/animation-1000_${index}.webp`
    }

    const hook = new ParallaxHook(
        container,
        () => {

        },
        (progress: any) => {
            const firstFrameIndex = 38
            const lastFrameIndex = 120
            const numberOfFrames = lastFrameIndex - firstFrameIndex
            const frameIndex = firstFrameIndex +
                Math.round(progress.value * numberOfFrames)
            frame.src = frameURL(frameIndex);
        },
        () => {}
    )

    const updateDeviceWidth = () => {
        if (document.documentElement.clientWidth < 1023) {
            canvas.style.display = 'none'
            preview.style.display = 'block'
            hook.detach()
        } else {
            const height = preview.clientHeight
            const width = preview.clientWidth
            preview.style.display = 'none'
            canvas.style.display = 'block'
            canvas.height = height
            canvas.width = width
            hook.attach()
        }
    }
    updateDeviceWidth()
    window.addEventListener('resize', updateDeviceWidth, false)
})
