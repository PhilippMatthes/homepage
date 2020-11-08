document.addEventListener("DOMContentLoaded", function(event) {
    var camera, scene, renderer, mesh, geometry;

    init();

    function onWindowResize() {
        var element = document.getElementById('profile-icon-webgl');
        camera.aspect = element.clientWidth / element.clientHeight;
        camera.updateProjectionMatrix();

        var vFOV = THREE.Math.degToRad( camera.fov );
        var maxHeight = 2 * Math.tan( vFOV / 2 ) * camera.position.z;
        var maxWidth = height * camera.aspect;
        var imageAspect = 600 / 600;
        var height = maxHeight;
        var width = maxHeight * imageAspect;
        mesh.scale.set(width, height, 1);

        renderer.setSize(element.clientWidth, element.clientHeight);
        window.requestAnimationFrame(function() {
            renderer.render(scene, camera);
        });
    }

    function init() {
        var element = document.getElementById('profile-icon-webgl');

        camera = new THREE.PerspectiveCamera(
            45, element.clientWidth / element.clientHeight, 1, 1000
        );

        renderer = new THREE.WebGLRenderer({
            antialias: true, alpha: true,
        });

        renderer.setSize(element.clientWidth, element.clientHeight);
        element.prepend(renderer.domElement);

        scene = new THREE.Scene();

        var vertexShader = `
            varying vec2 vUv;
            void main()	{
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        var fragmentShader = `
            #extension GL_OES_standard_derivatives : enable
            varying vec2 vUv;
            uniform float mouseX;
            uniform float mouseY;
            uniform float scrollOffset;
            uniform sampler2D depthTexture;
            uniform sampler2D texture;
            void main() {
                vec2 vMouse = vec2(mouseX, mouseY);
                vec2 vScrollOffset = vec2(0, scrollOffset);
                float depth = texture2D(depthTexture, vUv).r;
                gl_FragColor = texture2D(texture, vUv + vMouse * (depth) + vScrollOffset);
                // Do some edge anti aliasing, because the image contains
                // a premultiplied alpha channel
                gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a;
            }
        `;

        var textureLoader = new THREE.TextureLoader()
            .load('/static/img/ausschnitt.webp');
        var depthTextureLoader = new THREE.TextureLoader()
            .load('/static/img/ausschnitt-depth.webp');

        var shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                mouseX: {value: 0},
                mouseY: {value: 0},
                scrollOffset: {value: 0},
                texture: {value: textureLoader},
                depthTexture: {value: depthTextureLoader},
            },
            vertexShader,
            fragmentShader
        });

        camera.position.z = 200;

        geometry = new THREE.PlaneBufferGeometry(1, 1);
        mesh = new THREE.Mesh( geometry, shaderMaterial );

        scene.add(mesh);

        onWindowResize();
        window.addEventListener('resize', onWindowResize, false);

        document.addEventListener('mousemove', function(e) {
            var rect = element.getBoundingClientRect();
            var x = Math.max(-300, Math.min(300, e.clientX - rect.left));
            var y = Math.max(-300, Math.min(300, e.clientY - rect.top));
            shaderMaterial.uniforms.mouseX.value = -x / 15000;
            shaderMaterial.uniforms.mouseY.value = y / 15000;
            element.style.transform = `rotate3d(0, 1, 1, ${x / 50}deg)`;
            window.requestAnimationFrame(function() {
                renderer.render(scene, camera);
            });
        });
    }
});
