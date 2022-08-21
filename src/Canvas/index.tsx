import * as React from 'react';
import Paths, { SvgPath } from '../Paths';
import { CanvasPath, ExportImageType, Point } from '../types';
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => {
      if (img.width > 0) {
        resolve(img);
      }
      reject('Image not found');
    });
    img.addEventListener('error', (err) => reject(err));
    img.src = url;
    img.setAttribute('crossorigin', 'anonymous');
  });

function getCanvasWithViewBox(canvas: HTMLDivElement) {
  const svgCanvas = canvas.firstChild?.cloneNode(true) as SVGElement;

  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;

  svgCanvas.setAttribute('viewBox', `0 0 ${width} ${height}`);

  svgCanvas.setAttribute('width', width.toString());
  svgCanvas.setAttribute('height', height.toString());
  return { svgCanvas, width, height };
}

export interface CanvasProps {
  paths: CanvasPath[];
  isDrawing: boolean;
  onPointerDown: (point: Point) => void;
  onPointerMove: (point: Point) => void;
  onPointerUp: () => void;
  className?: string;
  id?: string;
  width: string;
  height: string;
  canvasColor: string;
  backgroundImage: string;
  exportWithBackgroundImage: boolean;
  preserveBackgroundImageAspectRatio: string;
  allowOnlyPointerType: string;
  style: React.CSSProperties;
  svgStyle: React.CSSProperties;
  onZoom?: ((scale: number) => void) | undefined;
}

export interface CanvasRef {
  exportImage: (imageType: ExportImageType) => Promise<string>;
  exportSvg: () => Promise<string>;
}

export const Canvas = React.forwardRef<CanvasRef, CanvasProps>((props, ref) => {
  const {
    paths,
    isDrawing,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    id = 'react-sketch-canvas',
    width = '100%',
    height = '100%',
    className = 'react-sketch-canvas',
    canvasColor = 'red',
    backgroundImage = '',
    exportWithBackgroundImage = false,
    preserveBackgroundImageAspectRatio = 'none',
    allowOnlyPointerType = 'all',
    style = {
      border: '0.0625rem solid #9c9c9c',
      borderRadius: '0.25rem',
    },
    svgStyle = {},
    onZoom,
  } = props;
  const zoomContainerRef = React.useRef<ReactZoomPanPinchRef>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [pointerCache, setPointerCache] = React.useState<
    React.PointerEvent<HTMLDivElement>[]
  >([]);
  const [allowZoom, setAllowZoom] = React.useState<boolean>(false); // useKeyPress('w');

  // Converts mouse coordinates to relative coordinate based on the absolute position of svg
  const getCoordinates = (
    pointerEvent: React.PointerEvent<HTMLDivElement>
  ): Point => {
    const boundingArea = canvasRef.current?.getBoundingClientRect();
    const zoomContainer = zoomContainerRef.current;

    const scrollLeft = window.scrollX ?? 0;
    const scrollTop = window.scrollY ?? 0;

    if (!boundingArea || !zoomContainer) {
      return { x: 0, y: 0 };
    }

    const scaleFactor = zoomContainer.state.scale;
    const zoomArea = {
      tranlationLeft: zoomContainer.state.positionX,
      translationTop: zoomContainer.state.positionY,
    };
    const point: Point = {
      x:
        (pointerEvent.pageX -
          boundingArea.left -
          zoomArea.tranlationLeft -
          scrollLeft) /
        scaleFactor,
      y:
        (pointerEvent.pageY -
          boundingArea.top -
          zoomArea.translationTop -
          scrollTop) /
        scaleFactor,
    };

    return point;
  };

  //#region Mouse Handlers - Mouse down, move and up

  /**
   * Handles a multitouch and returns the result.
   * Returns false, if it is no touch or a single one.
   * Returns true, if it is a touch withmultiple  simultaneous touch points.
   */
  const handleMultiTouch = (
    cache: React.PointerEvent<HTMLDivElement>[]
  ): boolean => {
    let result = false;

    switch (cache.length) {
      case 0:
        // Target element has no touch points
        setAllowZoom(false);
        result = false;
        break;
      case 1:
        // Single touch point
        setAllowZoom(false);
        result = false;
        break;
      case 2:
        // Two simultaneous touch points
        setAllowZoom(true);
        result = true;
        break;
      default:
        // Three or more simultaneous touches
        setAllowZoom(true);
        result = true;
    }
    console.log('Is multitouch: ' + result ? 'true' : 'false');
    return result;
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    // Allow only chosen pointer type
    if (
      allowOnlyPointerType !== 'all' &&
      event.pointerType !== allowOnlyPointerType
    ) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const isMultitouch = handleMultiTouch(pointerCache);
    if (allowZoom || isMultitouch) {
      // if zoom is allowed, drawing is forbidden
      return;
    }

    const point = getCoordinates(event);

    onPointerDown(point);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (!isDrawing) return;

    // Allow only chosen pointer type
    if (
      allowOnlyPointerType !== 'all' &&
      event.pointerType !== allowOnlyPointerType
    ) {
      return;
    }
    const isMultitouch = handleMultiTouch(pointerCache);
    if (allowZoom || isMultitouch) {
      // if zoom is allowed, drawing is forbidden
      return;
    }

    const point = getCoordinates(event);

    onPointerMove(point);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLDivElement> | PointerEvent
  ): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Allow only chosen pointer type
    if (
      allowOnlyPointerType !== 'all' &&
      event.pointerType !== allowOnlyPointerType
    ) {
      return;
    }

    if (allowZoom) {
      // if zoom is allowed, drawing is forbidden
      return;
    }
    onPointerUp();
  };

  const handleBlockerPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    // The pointerdown event signals the start of a touch interaction.
    // Save this event for later processing (this could be part of a
    // multi-touch interaction) and update the background color
    const newPointerCache = [...pointerCache, event];
    setPointerCache(newPointerCache); // add

    const isMultitouch = handleMultiTouch(newPointerCache);
    if (isMultitouch) {
      paths.pop(); // remove last drawn path
      event.stopPropagation();
    }
  };

  const handleBlockerPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    const isMultitouch = handleMultiTouch(pointerCache);
    if (allowZoom || isMultitouch) {
      event.stopPropagation();
    }
  };

  const handleBlockerPointerUp = (
    event: React.PointerEvent<HTMLDivElement> | PointerEvent
  ): void => {
    // remove from pointer cache
    const newPointerCache = [...pointerCache];

    for (let i = 0; i < newPointerCache.length; i++) {
      if (newPointerCache[i].pointerId === event.pointerId) {
        newPointerCache.splice(i, 1);
        break;
      }
    }
    setPointerCache(newPointerCache);

    const isMultitouch = handleMultiTouch(newPointerCache);
    if (isMultitouch) {
      event.stopPropagation();
    }
  };

  React.useImperativeHandle(ref, () => ({
    exportImage: (imageType: ExportImageType): Promise<string> => {
      return new Promise<string>(async (resolve, reject) => {
        try {
          const canvas = canvasRef.current;

          if (!canvas) {
            throw Error('Canvas not rendered yet');
          }

          const { svgCanvas, width, height } = getCanvasWithViewBox(canvas);
          const canvasSketch = `data:image/svg+xml;base64,${btoa(
            svgCanvas.outerHTML
          )}`;

          const loadImagePromises = [await loadImage(canvasSketch)];

          if (exportWithBackgroundImage) {
            try {
              const img = await loadImage(backgroundImage);
              loadImagePromises.push(img);
            } catch (error) {
              console.warn(
                'exportWithBackgroundImage props is set without a valid background image URL. This option is ignored'
              );
            }
          }

          Promise.all(loadImagePromises)
            .then((images) => {
              const renderCanvas = document.createElement('canvas');
              renderCanvas.setAttribute('width', width.toString());
              renderCanvas.setAttribute('height', height.toString());
              const context = renderCanvas.getContext('2d');

              if (!context) {
                throw Error('Canvas not rendered yet');
              }

              images.reverse().forEach((image) => {
                context.drawImage(image, 0, 0);
              });

              resolve(renderCanvas.toDataURL(`image/${imageType}`));
            })
            .catch((e) => {
              throw e;
            });
        } catch (e) {
          reject(e);
        }
      });
    },
    exportSvg: (): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        try {
          const canvas = canvasRef.current ?? null;

          if (canvas !== null) {
            const { svgCanvas } = getCanvasWithViewBox(canvas);

            if (exportWithBackgroundImage) {
              resolve(svgCanvas.outerHTML);
              return;
            }

            svgCanvas.querySelector(`#${id}__background`)?.remove();
            svgCanvas
              .querySelector(`#${id}__canvas-background`)
              ?.setAttribute('fill', canvasColor);

            resolve(svgCanvas.outerHTML);
          }

          reject(new Error('Canvas not loaded'));
        } catch (e) {
          reject(e);
        }
      });
    },
  }));

  /* Add event listener to Mouse up and Touch up to
  release drawing even when point goes out of canvas */
  React.useEffect(() => {
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerUp]);

  // /* Add event listener to Key up to
  // catch ctr button released*/
  // React.useEffect(() => {
  //   window.addEventListener('keydown', handleKeyDown);
  //   window.addEventListener('keyup', handleKeyUp);
  //   return () => {
  //     window.removeEventListener('keydown', handleKeyDown);
  //     window.removeEventListener('keyup', handleKeyUp);
  //   };
  // }, []);

  const eraserPaths = paths.filter((path) => !path.drawMode);

  let currentGroup = 0;
  const pathGroups = paths.reduce<CanvasPath[][]>(
    (arrayGroup, path) => {
      if (!path.drawMode) {
        currentGroup += 1;
        return arrayGroup;
      }

      if (arrayGroup[currentGroup] === undefined) {
        arrayGroup[currentGroup] = [];
      }

      arrayGroup[currentGroup].push(path);
      return arrayGroup;
    },
    [[]]
  );
  return (
    <TransformWrapper
      ref={zoomContainerRef}
      disabled={!allowZoom}
      pinch={{ disabled: !allowZoom }}
      panning={{ disabled: !allowZoom }}
      doubleClick={{ disabled: true }}
      onZoom={(ref) => {
        if (onZoom) {
          onZoom(ref.state.scale);
        }
      }}
    >
      <div
        onPointerDownCapture={handleBlockerPointerDown}
        onPointerMoveCapture={handleBlockerPointerMove}
        onPointerUpCapture={handleBlockerPointerUp}
      >
        <div
          role="presentation"
          ref={canvasRef}
          className={className}
          style={{
            touchAction: 'none',
            width,
            height,
            ...style,
          }}
          touch-action="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            <svg
              version="1.1"
              baseProfile="full"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
              style={{
                width: '100%',
                height: '100%',
                ...svgStyle,
              }}
              id={id}
            >
              <g id={`${id}__eraser-stroke-group`} display="none">
                <rect
                  id={`${id}__mask-background`}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill="white"
                />
                {eraserPaths.map((eraserPath, i) => (
                  <SvgPath
                    key={`${id}__eraser-${i}`}
                    id={`${id}__eraser-${i}`}
                    paths={eraserPath.paths}
                    strokeColor="#000000"
                    strokeWidth={eraserPath.strokeWidth}
                  />
                ))}
              </g>
              <defs>
                {backgroundImage && (
                  <pattern
                    id={`${id}__background`}
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    patternUnits="userSpaceOnUse"
                  >
                    <image
                      x="0"
                      y="0"
                      width="100%"
                      height="100%"
                      xlinkHref={backgroundImage}
                      preserveAspectRatio={preserveBackgroundImageAspectRatio}
                    ></image>
                  </pattern>
                )}

                {eraserPaths.map((_, i) => (
                  <mask
                    id={`${id}__eraser-mask-${i}`}
                    key={`${id}__eraser-mask-${i}`}
                    maskUnits="userSpaceOnUse"
                  >
                    <use href={`#${id}__mask-background`} />
                    {Array.from(
                      { length: eraserPaths.length - i },
                      (_, j) => j + i
                    ).map((k) => (
                      <use
                        key={k.toString()}
                        href={`#${id}__eraser-${k.toString()}`}
                      />
                    ))}
                  </mask>
                ))}
              </defs>
              <g id={`${id}__canvas-background-group`}>
                <rect
                  id={`${id}__canvas-background`}
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  fill={
                    backgroundImage ? `url(#${id}__background)` : canvasColor
                  }
                />
              </g>
              {pathGroups.map((pathGroup, i) => (
                <g
                  id={`${id}__stroke-group-${i}`}
                  key={`${id}__stroke-group-${i}`}
                  mask={`url(#${id}__eraser-mask-${i})`}
                >
                  <Paths id={id} paths={pathGroup} />
                </g>
              ))}
            </svg>
          </TransformComponent>
        </div>
      </div>
    </TransformWrapper>
  );
});

// // Hook
// function useKeyPress(targetKey: string) {
//   // State for keeping track of whether key is pressed
//   const [keyPressed, setKeyPressed] = React.useState<boolean>(false);
//   // If pressed key is our target key then set to true
//   function downHandler({ key }: { key: string }) {
//     if (key === targetKey && keyPressed === false) {
//       console.debug(key + ' is pressed.');
//       setKeyPressed(true);
//     }
//   }
//   // If released key is our target key then set to false
//   const upHandler = ({ key }: { key: string }) => {
//     if (key === targetKey) {
//       console.debug(key + ' is released.');
//       setKeyPressed(false);
//     }
//   };
//   // Add event listeners
//   React.useEffect(() => {
//     window.addEventListener('keydown', downHandler);
//     window.addEventListener('keyup', upHandler);
//     // Remove event listeners on cleanup
//     return () => {
//       window.removeEventListener('keydown', downHandler);
//       window.removeEventListener('keyup', upHandler);
//     };
//   }, []); // Empty array ensures that effect is only run on mount and unmount
//   return keyPressed;
// }
