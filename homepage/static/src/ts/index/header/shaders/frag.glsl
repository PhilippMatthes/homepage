#extension GL_OES_standard_derivatives : enable

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

// The normals texture.
uniform sampler2D normalsTexture;

// The actual image that we want to distort.
uniform sampler2D texture;

// The cube map for reflections.
uniform samplerCube cubemapTexture;

// Parallax Occlusion Mapping.
vec2 calculateParallaxUV() {
    // The focal point.
    vec2 pivot = vec2(0.5, 0.5);

    // Number of depth layers
    float minLayers = 32.0;
    float maxLayers = 128.0;

    // Calculate the camera rotation offset.
    vec2 vMouse = vec2(mouseX, mouseY);
    vec2 vScrollOffset = vec2(0, scrollOffset);
    vec2 offset = vMouse - vScrollOffset;

    float heightScale = 1.5;
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
    vec4 finalColor = texture2D(texture, parallaxUV);
    float depth = texture2D(depthTexture, parallaxUV).r;

    // Cast a directional light onto the image.
    vec2 vMouse = vec2(-mouseX, mouseY);
    vec2 vScrollOffset = vec2(0, scrollOffset);
    vec2 offset = vMouse + vScrollOffset;
    vec3 lightDirection = normalize(vec3(offset.x, offset.y, 0.01));
    vec3 normal = texture2D(normalsTexture, parallaxUV).rgb;
    float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
    vec3 lightColor = vec3(0.78823529, 0.84705882, 1.0) * 0.2;
    vec3 ambient = vec3(1.0, 1.0, 1.0);
    finalColor.rgb *= ambient + lightColor * diffuse;

    // Darken the background
    finalColor.rgb *= clamp(depth * 3.0, 0.0, 1.0);

    // Add background and foreground.
    float uvDistToCenter = length(vUv - vec2(0.5, 0.5));
    float cupolaR = 0.5;
    float cupolaHeight = sqrt(cupolaR * cupolaR - uvDistToCenter * uvDistToCenter);
    vec3 cupolaNormal = normalize(vec3(vUv + offset - vec2(0.5, 0.5), cupolaHeight));
    vec3 cupolaBackfaceNormal = normalize(vec3(vUv + offset - vec2(0.5, 0.5), -cupolaHeight));

    vec3 refraction = refract(vec3(0.0, 0.0, -1.0), cupolaBackfaceNormal, 0.5);
    vec3 refractionColor = textureCube(cubemapTexture, refraction).rgb;
    
    vec3 reflection = reflect(vec3(0.0, 0.0, -1.0), cupolaNormal);
    vec3 reflectionColor = textureCube(cubemapTexture, reflection).rgb;
    
    float reflectionFade = 1.0 - (cupolaHeight * 3.0);
    reflectionFade = clamp(reflectionFade, 0.0, 1.0);
    finalColor.rgb += reflectionColor * reflectionFade;

    // Add colors
    float shadowFade = 1.0 - (cupolaHeight * 2.0);
    shadowFade = clamp(shadowFade, 0.0, 1.0) * (1.0 - clamp(depth * 3.0, 0.0, 1.0));
    finalColor.rgb = mix(finalColor.rgb, cupolaNormal, shadowFade);

    gl_FragColor = finalColor;
    // Do some edge anti aliasing, because the image
    // may contain a premultiplied alpha channel.
    gl_FragColor.rgb = gl_FragColor.rgb * gl_FragColor.a;
}