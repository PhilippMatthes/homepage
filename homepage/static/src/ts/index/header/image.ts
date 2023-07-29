/**
 * The lazily imported THREE.js library.
 *
 * THREE is loaded lazily and only on devices exceeding a given
 * maximum width. It will not be included as a module to reduce the
 * file size of this script.
 */
declare var THREE: any

/**
 * A parallax image, driven by THREE.js.
 */
export class ParallaxImage {
    imageElement: HTMLImageElement

    parallaxScene?: ParallaxScene

    public constructor(imageElement: HTMLImageElement) {
        this.imageElement = imageElement
    }

    public async loadTextureBehindAttribute(attribute: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const src = this.imageElement.getAttribute(attribute)
            if (src === null) {
                reject(new Error(`
                    The image element must include
                    an attribute "${attribute}"!
                `))
                return
            }
            const textureLoader = new THREE.TextureLoader()
                .load(src, () => {
                    resolve(textureLoader)
                })
        })
    }

    public async loadCubemapBehindAttribute(attribute: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const src = this.imageElement.getAttribute(attribute)
            if (src === null) {
                reject(new Error(`
                    The image element must include
                    an attribute "${attribute}"!
                `))
                return
            }
            const textureLoader = new THREE.CubeTextureLoader()
                .setPath(src)
                // Use: https://matheowis.github.io/HDRI-to-CubeMap/
                // to convert an HDRI to a cubemap
                .load([
                    "px.png",
                    "nx.png",
                    "py.png",
                    "ny.png",
                    "pz.png",
                    "nz.png"
                ], () => {
                    resolve(textureLoader)
                })
        })
    }

    public async load() {
        if (this.parallaxScene !== undefined) {
            return
        }

        const width = this.imageElement.clientWidth
        const height = this.imageElement.clientHeight
        const camera = new THREE.PerspectiveCamera(
            45, width / height, 1, 1000
        )
        camera.position.z = 200
        const diffuseTextureLoader = await this
            .loadTextureBehindAttribute('src')
        const depthTextureLoader = await this
            .loadTextureBehindAttribute('data-parallax-depth-map')
        const normalsTextureLoader = await this
            .loadTextureBehindAttribute('data-parallax-normal-map')
        const cubemapTextureLoader = await this
            .loadCubemapBehindAttribute('data-parallax-cubemap-path')
        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false
        })
        renderer.setSize(width, height)
        const canvas = renderer.domElement

        // Load the fragment and vertex shader
        const fragmentShader = await (await fetch('/static/src/ts/index/header/shaders/frag.glsl')).text()
        const vertexShader = await (await fetch('/static/src/ts/index/header/shaders/vert.glsl')).text()

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                mouseX: {value: 0},
                mouseY: {value: 0},
                scrollOffset: {value: 0},
                texture: {value: diffuseTextureLoader},
                depthTexture: {value: depthTextureLoader},
                normalsTexture: {value: normalsTextureLoader},
                cubemapTexture: {value: cubemapTextureLoader}
            },
            vertexShader,
            fragmentShader
        })
        const scene = new THREE.Scene()
        const geometry = new THREE.PlaneBufferGeometry(1, 1)
        const mesh = new THREE.Mesh(geometry, shaderMaterial)
        scene.add(mesh)

        this.parallaxScene = new ParallaxScene(
            this.imageElement,
            canvas,
            camera,
            renderer,
            diffuseTextureLoader,
            depthTextureLoader,
            shaderMaterial,
            scene,
            geometry,
            mesh
        )
        return
    }

    public show(): void {
        this.parallaxScene?.show()
    }

    public hide(): void {
        this.parallaxScene?.hide()
    }
}


/**
 * A parallax scene, driven by THREE.js.
 */
class ParallaxScene {
    image: HTMLImageElement
    canvas: HTMLCanvasElement
    camera: any
    renderer: any
    diffuseTextureLoader: any
    depthTextureLoader: any
    shaderMaterial: any
    scene: any
    geometry: any
    mesh: any

    lastOrientation: DeviceOrientationEvent | null = null

    public constructor(
        image: HTMLImageElement,
        canvas: HTMLCanvasElement,
        camera: any,
        renderer: any,
        diffuseTextureLoader: any,
        depthTextureLoader: any,
        shaderMaterial: any,
        scene: any,
        geometry: any,
        mesh: any
    ) {
        this.image = image
        this.canvas = canvas
        this.camera = camera
        this.renderer = renderer
        this.diffuseTextureLoader = diffuseTextureLoader
        this.depthTextureLoader = depthTextureLoader
        this.shaderMaterial = shaderMaterial
        this.scene = scene
        this.geometry = geometry
        this.mesh = mesh
    }

    private requestAnimationFrame(): void {
        window.requestAnimationFrame(() => {
            this.renderer.render(this.scene, this.camera)
        })
    }

    private updateViewportAspectRatio(): void {
        this.camera.aspect =
            this.image.naturalWidth / this.image.naturalHeight
        this.camera.updateProjectionMatrix()
        const vFOV = THREE.Math.degToRad(this.camera.fov)
        const maxHeight = 2 * Math.tan(vFOV / 2) * this.camera.position.z
        const imageAspect =
            this.image.naturalHeight / this.image.naturalWidth
        const height = maxHeight
        const width = maxHeight * imageAspect
        this.mesh.scale.set(width, height, 1)
        this.requestAnimationFrame()
    }

    private reactToMouseMove(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect()
        const x = Math.max(-500, Math.min(500, event.clientX - rect.left))
        const y = Math.max(-500, Math.min(500, event.clientY - rect.top))
        this.shaderMaterial.uniforms.mouseX.value = -x / 15000
        this.shaderMaterial.uniforms.mouseY.value = y / 15000
        this.requestAnimationFrame()
    }

    private reactToTouchMove(event: TouchEvent): void {
        const rect = this.canvas.getBoundingClientRect()
        const x = Math.max(-500, Math.min(500, event.touches[0].clientX - rect.left))
        const y = Math.max(-500, Math.min(500, event.touches[0].clientY - rect.top))
        this.shaderMaterial.uniforms.mouseX.value = -x / 15000
        this.shaderMaterial.uniforms.mouseY.value = y / 15000
        this.requestAnimationFrame()
    }

    private reactToScroll(): void {
        const scrollOffset = Math.min(Math.max(0.3 * (window.scrollY / window.innerHeight), 0), 0.5)
        this.shaderMaterial.uniforms.scrollOffset.value = scrollOffset
        this.requestAnimationFrame()
    }

    public show(): void {
        this.canvas.style.display = 'inline-block'
        this.image.style.display = 'none'
        if (this.canvas.parentNode === null) {
            this.image.parentNode.insertBefore(
                this.canvas, this.image.nextSibling
            )
            this.renderer.setSize(
                this.canvas.clientWidth,
                this.canvas.clientHeight
            )
        }
        window.addEventListener(
            'resize',
            this.updateViewportAspectRatio.bind(this),
            true
        )
        document.addEventListener(
            'mousemove',
            this.reactToMouseMove.bind(this),
            true
        )
        document.addEventListener(
            'touchmove',
            this.reactToTouchMove.bind(this),
            true
        )
        window.addEventListener(
            'scroll', 
            this.reactToScroll.bind(this),
            true
        );
        this.updateViewportAspectRatio()
        this.requestAnimationFrame()
    }

    public hide(): void {
        this.image.style.display = 'inline-block'
        this.canvas.style.display = 'none'
        window.removeEventListener(
            'resize',
            this.updateViewportAspectRatio.bind(this),
            true
        )
        document.removeEventListener(
            'mousemove',
            this.reactToMouseMove.bind(this),
            true
        )
        document.removeEventListener(
            'touchmove',
            this.reactToTouchMove.bind(this),
            true
        )
        window.removeEventListener(
            'scroll',
            this.reactToScroll.bind(this),
            true
        )
    }
}
