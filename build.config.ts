import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  rollup: {
    inlineDependencies: [
      'tinyglobby',
      'fdir',
      'picomatch',
    ],
  },
})
