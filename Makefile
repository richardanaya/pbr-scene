serve:
	http-server -p 8080
build:
	matc -a opengl -p mobile -o pbr.filamat pbr.mat
	cmgen -x . --format=ktx --size=256 --extract-blur=0.1  simple.hdr
	mv simple/*.ktx .
	rm -rf simple
