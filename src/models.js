'use strict';

function replaceModelRefs(restApiId, cfModel) {
    if (!cfModel.Properties || !cfModel.Properties.Schema || Object.keys(cfModel.Properties.Schema).length == 0) {
      return cfModel;
    }

    function replaceRefs(obj) {
        for (let key of Object.keys(obj)) {
            if (key === '$ref') {
                let match;
                if (match = /{{model:\s*([\-\w]+)}}/.exec(obj[key])) {
                    obj[key] = {
                        'Fn::Join': [
                            '/',
                            [
                                'https://apigateway.amazonaws.com/restapis',
                                restApiId,
                                'models',
                                match[1]
                            ]
                        ]
                    };
                    if (!cfModel.DependsOn) {
                        cfModel.DependsOn = new Set();
                    }
                    cfModel.DependsOn.add(match[1]+'Model');
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                replaceRefs(obj[key]);
            }
        }
    }

    replaceRefs(cfModel.Properties.Schema);
    if (cfModel.DependsOn) {
        cfModel.DependsOn = Array.from(cfModel.DependsOn);
    }
    return cfModel;
}

module.exports = {
  createCfModel: function createCfModel(restApiId) {
    return function(model) {

      if (model.unmanaged) return null

      let cfModel = {
        Type: 'AWS::ApiGateway::Model',
        Properties: {
          RestApiId: restApiId,
          ContentType: model.contentType,
          Name: model.name,
          Schema: model.schema || {},
        },
      }

      if (model.description) {
        cfModel.Properties.Description = model.description
      }

      return replaceModelRefs(restApiId, cfModel)
    }
  },

  addModelDependencies: function addModelDependencies(models, resource, _models) {
    Object.keys(models).forEach(contentType => {
      const name = models[contentType];
      if (!_models[name].unmanaged) resource.DependsOn.add(`${name}Model`);
    });
  },

  addMethodResponses: function addMethodResponses(resource, documentation, _models) {
    if (documentation.methodResponses) {
      if (!resource.Properties.MethodResponses) {
        resource.Properties.MethodResponses = [];
      }

      documentation.methodResponses.forEach(response => {
        const statusCode = response.statusCode.toString();
        let _response = resource.Properties.MethodResponses
          .find(originalResponse => originalResponse.StatusCode.toString() === statusCode);

        if (!_response) {
          _response = {
            StatusCode: statusCode,
          };

          if (response.responseHeaders) {
            const methodResponseHeaders = {};
            response.responseHeaders.forEach(header => {
              methodResponseHeaders[`method.response.header.${header.name}`] = true
            });
            _response.ResponseParameters = methodResponseHeaders;
          }

          resource.Properties.MethodResponses.push(_response);
        }

        if (response.responseModels) {
          _response.ResponseModels = response.responseModels;
          this.addModelDependencies(_response.ResponseModels, resource, _models);
        }
      });
    }
  },

  addRequestModels: function addRequestModels(resource, documentation, _models) {
    if (documentation.requestModels && Object.keys(documentation.requestModels).length > 0) {
      this.addModelDependencies(documentation.requestModels, resource, _models);
      resource.Properties.RequestModels = documentation.requestModels;
    }
  }

};
