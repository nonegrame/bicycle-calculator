FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY wuling-pacer-53k/ /usr/share/nginx/html/pacer/
COPY wuling-pacer-53k-predict/ /usr/share/nginx/html/predict/
COPY nginx.conf /etc/nginx/conf.d/default.conf
