#define texture2D texture

// The uv coordinates of the current pixel.
varying vec2 vUv;

// The horizontal mouse position in the range [0, 1].
uniform float mouseX;

// The vertical mouse position in the range [0, 1].
uniform float mouseY;

// The vertical scroll offset.
uniform float scrollOffset;

// The depth texture (grayscale image).
uniform sampler2D depthTexture;

// The actual image that we want to distort.
uniform sampler2D imageTexture;

// The cube map for reflections.
uniform samplerCube cubemapTexture;

// Source: https://webgl-shaders.com/shaders/frag-sphere.glsl
// License: LPGL-3.0
vec3 calculateNormal(vec3 position) {
    vec3 fdx = vec3(dFdx(position.x), dFdx(position.y), dFdx(position.z));
    vec3 fdy = vec3(dFdy(position.x), dFdy(position.y), dFdy(position.z));
    vec3 normal = normalize(cross(fdx, fdy));
    if (!gl_FrontFacing) normal = -normal;
    return normal;
}

// Parallax Occlusion Mapping.
vec2 calculateParallaxUV() {
    // The focal point.
    vec2 pivot = vec2(0.5, 0.5);

    // Number of depth layers
    float minLayers = 32.0;
    float maxLayers = 128.0;

    // Calculate the camera rotation offset.
    float cMouseX = clamp(-mouseX / 10.0, -0.075, 0.075);
    float cMouseY = clamp(mouseY / 10.0, -0.075, 0.075);
    vec2 vMouse = vec2(cMouseX, cMouseY);
    vec2 vScrollOffset = vec2(0, scrollOffset);
    vec2 offset = vMouse - vScrollOffset;

    float heightScale = 0.5;
    float numLayers = mix(
        maxLayers, minLayers, 
        abs(dot(vec3(0.0, 0.0, 1.0), vec3(offset, -1.0)))
    );
    float layerDepth = 1.0 / numLayers;
    float currentLayerDepth = 0.0;
    vec2 P = offset * heightScale;
    vec2 deltaTexCoords = P / numLayers;

    vec2 currentTexCoords = vUv + pivot * offset;
    float currentDepthMapValue = 1.0 - texture2D(depthTexture, currentTexCoords).r;

    for ( int i = 0; i == 0; i += 0 ) { // while loop is not supported in WebGL 1.0
        if ( currentDepthMapValue <= currentLayerDepth ) {
            break;
        }

        currentTexCoords -= deltaTexCoords;
        currentDepthMapValue = 1.0 - texture2D(depthTexture, currentTexCoords).r;
        currentLayerDepth += layerDepth;
    }
    vec2 prevTexCoords = currentTexCoords + deltaTexCoords;

    float afterDepth = currentDepthMapValue - currentLayerDepth;
    float beforeDepth = 1.0 
        - texture2D(depthTexture, prevTexCoords).r 
        - currentLayerDepth + layerDepth;

    float weight = afterDepth / (afterDepth - beforeDepth);
    vec2 parallaxUV = prevTexCoords * weight + currentTexCoords * (1.0 - weight);

    return parallaxUV;
}

void main() {
    vec2 parallaxUV = calculateParallaxUV();
    vec4 finalColor = texture2D(imageTexture, parallaxUV);
    float depth = texture2D(depthTexture, parallaxUV).r;

    vec2 vMouse = vec2(mouseX, mouseY);
    vec2 vScrollOffset = vec2(0, scrollOffset);
    vec2 offset = vMouse + vScrollOffset;

    // Calculate the average normal with a small blur.
    vec3 totalNormal = vec3(0.0, 0.0, 0.0);
    for (int i = 0; i < 5; i++) { // Small blur to reduce artifacts.
        vec2 sampleOffset = vec2(0.0, 0.0);
        if (i == 1) sampleOffset = vec2(0.0, 1.0);
        if (i == 2) sampleOffset = vec2(1.0, 0.0);
        if (i == 3) sampleOffset = vec2(0.0, -1.0);
        if (i == 4) sampleOffset = vec2(-1.0, 0.0);
        vec2 sampleLocation = parallaxUV + sampleOffset / 50.0;
        float sampleDepth = texture2D(depthTexture, sampleLocation).r;
        vec3 normal = calculateNormal(vec3(sampleLocation, sampleDepth));
        totalNormal += normal / 5.0;
    }

    // Cast a directional light onto the image.
    vec3 lightDirection = vec3(offset.x - 0.5, -offset.y - 0.5, 1.0);
    float diffuse = clamp(dot(normalize(totalNormal), normalize(lightDirection)), 0.0, 1.0);
    vec3 lightColorX = mix(vec3(0.3, 0.0, 3.0), vec3(1.0, 0.0, 0.5), clamp(mouseX, 0.0, 1.0));
    vec3 lightColorY = mix(vec3(0.3, 0.6, 0.3), vec3(0.3, 0.0, 0.3), clamp(mouseY, 0.0, 1.0));
    float distFromCenterX = abs(clamp(mouseX, 0.0, 1.0) - 0.5);
    float distFromCenterY = abs(clamp(mouseY, 0.0, 1.0) - 0.5);
    vec3 light = vec3(0.8, 0.8, 0.8);
    light = mix(light, lightColorX, distFromCenterX * 2.0);
    light = mix(light, lightColorY, distFromCenterY * 2.0);
    vec3 ambient = vec3(0.9, 0.9, 0.9);
    finalColor.rgb *= ambient + light * diffuse * 0.4;

    // Darken the background
    float personMask = clamp((depth - 0.1) / (0.2 - 0.1), 0.0, 1.0);
    finalColor.rgb *= personMask;

    // Add background and foreground with reflections.
    float uvDistToCenter = length(vUv - vec2(0.5, 0.5));
    float cupolaR = 0.5;
    float cupolaHeight = sqrt(cupolaR * cupolaR - uvDistToCenter * uvDistToCenter);
    vec3 cupolaNormal = normalize(vec3(vUv - vec2(0.5, 0.5), cupolaHeight));
    vec3 cupolaBackfaceNormal = normalize(vec3(vUv - vec2(0.5, 0.5), -cupolaHeight));
    vec3 refraction = refract(vec3(0.0, 0.0, -1.0), cupolaBackfaceNormal, 0.5);
    vec3 refractionColor = textureCube(cubemapTexture, refraction).rgb;
    vec3 reflection = reflect(vec3(0.0, 0.0, -1.0), cupolaNormal);
    vec3 reflectionColor = textureCube(cubemapTexture, reflection).rgb;
    float reflectionFade = 1.0 - (cupolaHeight * 3.0);
    reflectionFade = clamp(reflectionFade, 0.0, 1.0);
    finalColor.rgb += reflectionColor * reflectionFade;

    // Add a color halo (based on the normals of the cupola).
    float haloFade = 1.0 - (cupolaHeight * 2.0);
    haloFade = clamp(haloFade, 0.0, 1.0) * (1.0 - personMask);
    finalColor.rgb = mix(finalColor.rgb, cupolaNormal, haloFade);

    gl_FragColor = finalColor;

    // Do some edge anti aliasing, because the image
    // may contain a premultiplied alpha channel.
    gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a;
}
