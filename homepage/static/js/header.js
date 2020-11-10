document.addEventListener("DOMContentLoaded", function(event) {
    function setup() {
        var preview = document.getElementById('profile-icon-preview');
        var element = document.getElementById('profile-icon-webgl');

        var camera = new THREE.PerspectiveCamera(
            45, element.clientWidth / element.clientHeight, 1, 1000
        );
        camera.position.z = 200;

        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(element.clientWidth, element.clientHeight);
        element.prepend(renderer.domElement);

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
            .load('/static/img/ausschnitt.webp', function() {
                onWindowResize();
            });

        var depthTextureLoader = new THREE.TextureLoader()
            .load('/static/img/ausschnitt-depth.webp', function() {
                onWindowResize();
            });

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

        var scene = new THREE.Scene();
        var geometry = new THREE.PlaneBufferGeometry(1, 1);
        var mesh = new THREE.Mesh(geometry, shaderMaterial);
        scene.add(mesh);

        function onMouseMove(e) {
            var rect = element.getBoundingClientRect();
            var x = Math.max(-500, Math.min(500, e.clientX - rect.left));
            var y = Math.max(-500, Math.min(500, e.clientY - rect.top));
            shaderMaterial.uniforms.mouseX.value = -x / 15000;
            shaderMaterial.uniforms.mouseY.value = y / 15000;
            element.style.transform = `rotate3d(0, 1, 1, ${x / 50}deg)`;
            window.requestAnimationFrame(function() {
                renderer.render(scene, camera);
            });
        }

        function onWindowResize() {
            camera.aspect = element.clientWidth / element.clientHeight;
            camera.updateProjectionMatrix();

            var vFOV = THREE.Math.degToRad(camera.fov);
            var maxHeight = 2 * Math.tan(vFOV / 2) * camera.position.z;
            var imageAspect = 600 / 600;
            var height = maxHeight;
            var width = maxHeight * imageAspect;
            mesh.scale.set(width, height, 1);

            renderer.setSize(element.clientWidth, element.clientHeight);
            window.requestAnimationFrame(function() {
                renderer.render(scene, camera);
            });
        }

        function updateDeviceWidth() {
            if (document.documentElement.clientWidth < 1023) {
                element.style.display = 'none';
                preview.style.display = 'block';
                window.removeEventListener('resize', onWindowResize, true);
                document.removeEventListener('mousemove', onMouseMove, true);
            } else {
                preview.style.display = 'none';
                element.style.display = 'block';
                onWindowResize();
                window.addEventListener('resize', onWindowResize, true);
                document.addEventListener('mousemove', onMouseMove, true);
            }
        }

        updateDeviceWidth();
        window.addEventListener('resize', updateDeviceWidth, false);
    }

    var threeIsLoaded = false;

    function loadThreeAndSetupIfNeeded() {
        if (document.documentElement.clientWidth < 1023) return;
        if (threeIsLoaded) return;
        var script = document.createElement('script');
        script.setAttribute('src', '/static/vendor/js/three.min.js');
        script.onload = setup;
        document.body.appendChild(script);
    }

    loadThreeAndSetupIfNeeded();
    window.addEventListener('resize', loadThreeAndSetupIfNeeded, false);
});
