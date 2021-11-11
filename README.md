# CamFollowerJS
Generator and simulator of cams profiles for cam/follower mechanisms.

![image](https://user-images.githubusercontent.com/1620953/141312388-9c3ec638-f62d-49df-a96e-2aecd7074bcc.png)


**This page can work also offline on your PC**

This page allows creating cam profiles for cam/follower mechanisms used in automata. The cam can be started from scratch, or loaded from an existing file, edited and saved again.

The page loads the flat cartesian profile of the cam, and turns it into a circular/polar profile, the it starts rotating the cam as per aramters specified in the file itself (direction and speed) and shows how a follower follows the cam profile. Note: current version does not perform any check on output, so resulting cams could be impossible to realize in practice.

----------

Theory of cams/followers:

![image](https://user-images.githubusercontent.com/1620953/141312522-59cf64f7-0982-478a-a318-a5d808a59519.png)

https://www.researchgate.net/figure/Schematic-of-the-cam-follower-mechanism-adapted-from-Ref-33-The-cam-rotates-about_fig8_279290006



3d cam example:

![image](https://user-images.githubusercontent.com/1620953/141312905-53ddbb39-25a8-441e-94ea-09da226ff0c5.png)

In the future CamFollowerJS will implement export in  STL format for 3d printing.
