export const swaggerDocument = {

  openapi: '3.0.3',

  info: {
    title: 'Trimble Connect MCP Server',

    description:
      'Trimble Connect API gateway and MCP server',

    version: '1.0.0'
  },

  servers: [
    {
      url:
        process.env.PUBLIC_BASE_URL ||
        'http://localhost:3000'
    }
  ],

  components: {

    securitySchemes: {

      bearerAuth: {

        type: 'http',

        scheme: 'bearer',

        bearerFormat:
          'OAuth2 access token'
      }

    }

  },

  paths: {

    '/health': {

      get: {

        security: [],

        summary: 'Health check',

        responses: {

          200: {
            description:
              'Server is healthy'
          }

        }

      }

    },

    '/api/pdf/extract-column-schedule': {

      post: {

        summary:
          'Extract column schedule from PDF',

        description:
          'Upload a Tekla structural column schedule PDF and extract normalized column schedule data.',

        security: [],

        requestBody: {

          required: true,

          content: {

            'multipart/form-data': {

              schema: {

                type: 'object',

                required: [
                  'file'
                ],

                properties: {

                  file: {

                    type: 'string',

                    format: 'binary',

                    description:
                      'PDF file containing the column schedule'

                  }

                }

              }

            }

          }

        },

        responses: {

          200: {

            description:
              'Column schedule extracted successfully',

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  properties: {

                    success: {
                      type: 'boolean'
                    },

                    file: {
                      type: 'string'
                    },

                    count: {
                      type: 'integer'
                    },

                    rows: {

                      type: 'array',

                      items: {

                        type: 'object',

                        properties: {

                          DetailMark: {
                            type: 'string'
                          },

                          StartStorey: {
                            type: 'string'
                          },

                          EndStorey: {
                            type: 'string'
                          },

                          Width: {
                            type: 'number'
                          },

                          Breadth: {
                            type: 'number'
                          },

                          BottomRebar: {
                            type: 'string'
                          },

                          TopRebar: {
                            type: 'string'
                          },

                          Stirrups: {
                            type: 'string'
                          },

                          Method: {
                            type: 'string'
                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          },

          400: {

            description:
              'PDF file is missing'

          },

          500: {

            description:
              'PDF extraction failed'

          }

        }

      }

    },

    '/api/v1/users/me': {

      get: {

        summary:
          'Get current Trimble Connect user',

        security: [
          {
            bearerAuth: []
          }
        ],

        responses: {

          200: {
            description:
              'Authenticated Trimble Connect user'
          },

          401: {
            description:
              'Authentication required'
          },

          500: {
            description:
              'Trimble API error'
          }

        }

      }

    },

    '/api/v1/regions': {

      get: {

        summary:
          'Get Trimble Connect regions',

        security: [
          {
            bearerAuth: []
          }
        ],

        responses: {

          200: {
            description:
              'Available Trimble Connect regions'
          },

          401: {
            description:
              'Authentication required'
          }

        }

      }

    },

    '/api/v1/projects': {

      get: {

        summary:
          'Get Trimble Connect projects',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'fullyLoaded',

            in:
              'query',

            required:
              false,

            schema: {
              type: 'boolean'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Projects retrieved successfully'
          },

          401: {
            description:
              'Authentication required'
          },

          500: {
            description:
              'Trimble API error'
          }

        }

      }

    },

    '/api/v1/projects/{projectId}': {

      get: {

        summary:
          'Get a Trimble Connect project',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Project retrieved successfully'
          },

          401: {
            description:
              'Authentication required'
          },

          404: {
            description:
              'Project not found'
          }

        }

      }

    },

    '/api/v1/projects/{projectId}/folders': {

      get: {

        summary:
          'Get project folders',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Folders retrieved successfully'
          }

        }

      }

    },

    '/api/v1/projects/{projectId}/files': {

      get: {

        summary:
          'Get project files',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Files retrieved successfully'
          }

        }

      }

    }

  }

};