import { perlin3D } from '@leodeslf/perlin-noise';
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import alea from 'alea';

const prng = alea('random_seed');
const waterNoise3D = createNoise3D(alea(prng().toString()));
const heightNoise3D = createNoise3D(alea(prng().toString()));

export function getDisplacementOld(x: number, y: number, z: number): number {
    // x += performance.timing.navigationStart;
    x = x/100;
    y = y/100;
    z = z/100;


    x = x/10;
    y = y/10;
    z = z/10;

    // x = x/100;
    // y = y/100;
    // z = z/100;

    let max = 10;
    let min = -2;

    let amp = 1;
    let freq = 1;
    let t = 0;
    for (var i = 1; i < 4; i++) {
        t += perlin3D(x * freq, y * freq, z * freq) * amp;
        amp *= 0.4;
        freq *= 2;
    }

    amp = t / 2;
    freq = 1;
    let n = 0;
    for (var i = 1; i < 10; i++) {
        n += perlin3D(x * freq, y * freq, z * freq) * amp;
        amp *= 0.5;
        freq *= 2;
    }

    if (n > max) max = n;
    if (n < min) min = n;

    let top = 0.07;
    if (n > top)
        n = top + (n-top)/5;

    return (0.5+(10*(1-( 0.8*n * (1-n*n)))))/10;
    // return (0.5+(10*(1-n)))/10;
    // return 1+(0.05*(1-n));
    return 1;

}



function scaleInput(x: number, y: number, z: number, scale: number): number[]{
    return [x/scale, y/scale, z/scale];
}

function fbm(x: number, y: number, z: number, H: number, numOctaves: number, startingAmp: number, noiseFunc: NoiseFunction3D): number{
    const G = Math.pow(2, -H);
    let f = 1.0;
    let a = startingAmp; //1.0
    let t = 0.0;
    for(let i = 0; i < numOctaves; i++ )
    {
        t += a * noiseFunc(f*x, f*y, f*z);
        f *= 2.0;
        a *= G;
    }
    return t;
}

// value (-1, 1)
function scaleValue(value: number, min: number, max: number): number {
    return ((value + 1) / 2) * (max - min) + min;
}

let range = [0.5, 1.5];
let hist = {};
export function getDisplacement(x: number, y: number, z: number): number {

    let [wx, wy, wz] = scaleInput(x, y, z, 3000);
    
    let landMap = fbm(wx, wy, wz, 1.5, 12, 1.0, waterNoise3D);
    // if (landMap < 0.05) landMap = 0.0;
    landMap = (landMap*landMap);
    // [x, y, z] = scaleInput(x, y, z, 4);

    let [hx, hy, hz] = scaleInput(x, y, z, 1500);
    let height = fbm(hx, hy, hz, 1.5, 12, 5, heightNoise3D);// Math.pow(1-landMap, 2)*fbm(x+1000, y-10000, z, 2, 9, 1.0);
    height *= height;
    // if (height < 0.02) height = 0.0;
    // console.log(height)
    
    // console.log(1000*landMap);
    return (30*height*landMap)-0.1;//*landMap;
    // let newA = fbm(x, y, z, 1.3, 4, 1.0);

    // return scaleValue(noise3D(x, y, z), 2/3, 4/3);
    // return scaleValue(height, 0.9, 1.1);
    
    // let n = 1 + water;

    // return n;//(0.5+(10*(1-( 0.8*n * (1-n*n)))))/10;
    
    // return n+1;
}