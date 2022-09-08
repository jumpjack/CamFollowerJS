Some notes about how to plot a cam profile.

## Knife follower

Simplest method: the follower profile shall be just converted into polar coordinates, i.e. each vertical segment representing follower 
edge distance from lower axis shall be converted into circle radius.

## Roller follower

- 1: proceed like for knife follower, drawing a radius per each step in follower profile:

![image](https://user-images.githubusercontent.com/1620953/189108655-09c919b8-fbe2-4f6e-a016-575017df2302.png)

- 2: draw a circle centered on each follower edge position around cam center:

![image](https://user-images.githubusercontent.com/1620953/189108693-4169419e-737e-41de-8da3-7c4f2feb0c22.png)

- 3: draw a curved line tangent to all circles above

    - 3a: Find intersection of follower axis at position 0 with cam radius:

![image](https://user-images.githubusercontent.com/1620953/189108924-c0b3456b-cc93-45e8-8856-9b417774cc4f.png)

    - 3b: draw a tangent to second circle passing through point just found:

![image](https://user-images.githubusercontent.com/1620953/189109176-89f596dc-dbb4-4b4b-93bd-b5fe732776df.png)

    - 3c: mark the tangence point as P1:
    
![image](https://user-images.githubusercontent.com/1620953/189110591-64013417-8414-4b7e-9188-c397a59a94fd.png)

    - 3d: repeat from step 3a for next points, tracing tangents from last found point to next circle, until you arrive again to P0:

![image](https://user-images.githubusercontent.com/1620953/189109903-dc2340a3-3e3e-453b-8201-57af86a6faff.png)

    - 3d: smooth the resulting line into a contiuous curve:

![image](https://user-images.githubusercontent.com/1620953/189111042-de575a98-8055-46ac-bd6d-9119bfabe978.png)

