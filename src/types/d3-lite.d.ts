declare module "d3" {
  export function select(target: any): any;
  export function scaleLinear<T = number>(): any;
  export function geoPath(projection?: any): any;
  export function geoGraticule(): any;
  export function zoom(): any;
}

declare module "d3-geo-projection" {
  export function geoAitoff(): any;
}

declare module "plotly.js/dist/plotly" {
  const Plotly: any;
  export default Plotly;
}
